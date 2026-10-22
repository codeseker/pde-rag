import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../config/env';
import type {
  IMathVerifier,
  VerifyMathRequest,
  VerifyMathResponse,
} from './interfaces/math-verifier.interface';

const VerifierResponseSchema = z.object({
  status: z.enum(['verified', 'failed', 'inconclusive']),
  message: z.string(),
  residual: z.string().optional(),
  checks: z
    .array(
      z.object({
        name: z.string(),
        passed: z.boolean(),
        detail: z.string().optional(),
      }),
    )
    .optional(),
});

@Injectable()
export class VerifierClient implements IMathVerifier {
  async verify(request: VerifyMathRequest): Promise<VerifyMathResponse> {
    try {
      const response = await fetch(`${env.VERIFIER_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        return {
          status: 'inconclusive',
          message: `SymPy verifier returned HTTP ${response.status}.`,
        };
      }

      const body: unknown = await response.json();
      const parsed = VerifierResponseSchema.safeParse(body);
      if (!parsed.success) {
        return {
          status: 'inconclusive',
          message: 'SymPy verifier returned an unexpected response.',
        };
      }
      return parsed.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'inconclusive',
        message: `SymPy verifier unavailable: ${message}`,
      };
    }
  }
}
