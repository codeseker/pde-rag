import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import type { RetrievedChunk } from '../database/chunk.repository';

export type QueryType = 'pde_solve' | 'plasma_semiconductor' | 'out_of_scope';
export type Verification = 'verified' | 'failed' | 'inconclusive' | 'not_applicable';

export const ClassificationSchema = z.object({
  queryType: z.enum(['pde_solve', 'plasma_semiconductor', 'out_of_scope']),
});

export const SolutionSchema = z.object({
  steps: z.array(z.string()).min(1),
  final_answer_latex: z.string().default(''),
  final_answer_sympy: z.string().default(''),
  pde_sympy: z.string().default(''),
  conditions_sympy: z.array(z.string()).default([]),
});

export type SolveResult = z.infer<typeof SolutionSchema>;

export const AskState = Annotation.Root({
  question: Annotation<string>(),
  queryType: Annotation<QueryType>({
    reducer: (_current, update) => update,
    default: () => 'out_of_scope',
  }),
  chunks: Annotation<RetrievedChunk[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  solution: Annotation<SolveResult | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  verification: Annotation<Verification>({
    reducer: (_current, update) => update,
    default: () => 'not_applicable',
  }),
  verificationMessage: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
});

export type AskStateValue = typeof AskState.State;
export type AskStateUpdate = typeof AskState.Update;
