export type VerificationStatus = 'verified' | 'failed' | 'inconclusive';

export interface VerifyMathRequest {
  pde: string;
  candidate: string;
  conditions?: string[];
  expected?: string;
}

export interface VerifyMathResponse {
  status: VerificationStatus;
  message: string;
  residual?: string;
  checks?: Array<{ name: string; passed: boolean; detail?: string }>;
}

export interface IMathVerifier {
  verify(request: VerifyMathRequest): Promise<VerifyMathResponse>;
}
