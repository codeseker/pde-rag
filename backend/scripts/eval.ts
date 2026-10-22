import { z } from 'zod';
import { env } from '../src/config/env';
import { parseJsonObject } from '../src/ask/json';
import { LlmContext } from '../src/models/llm.context';
import { GroqLlmStrategy } from '../src/models/strategies/groq-llm.strategy';
import { OllamaLlmStrategy } from '../src/models/strategies/ollama-llm.strategy';
import { OpenAiLlmStrategy } from '../src/models/strategies/openai-llm.strategy';

// REVIEW AND EXTEND: this is a starter set of 15 questions (5 textbook PDE,
// 5 JEE-style, 5 plasma/conceptual). Add your own questions and reference
// answers before using the score as a production quality gate.

type Category = 'textbook' | 'jee' | 'plasma';
type CheckMode = 'math' | 'conceptual';

interface EvalQuestion {
  id: string;
  category: Category;
  mode: CheckMode;
  question: string;
  expected: string;
}

const QUESTIONS: EvalQuestion[] = [
  {
    id: 'tb-1',
    category: 'textbook',
    mode: 'math',
    question:
      'Solve the heat equation u_t = alpha^2 u_xx on 0 < x < L with u(0,t)=u(L,t)=0 and u(x,0)=sin(pi*x/L).',
    expected: 'sin(pi*x/L)*exp(-alpha**2*pi**2*t/L**2)',
  },
  {
    id: 'tb-2',
    category: 'textbook',
    mode: 'math',
    question:
      'Solve the wave equation u_tt = c^2 u_xx on 0 < x < L with u(0,t)=u(L,t)=0, u(x,0)=sin(pi*x/L), and u_t(x,0)=0.',
    expected: 'sin(pi*x/L)*cos(c*pi*t/L)',
  },
  {
    id: 'tb-3',
    category: 'textbook',
    mode: 'math',
    question:
      'Solve Laplace equation u_xx + u_yy = 0 on the unit square 0 < x < 1, 0 < y < 1 with u(0,y)=u(1,y)=u(x,0)=0 and u(x,1)=sin(pi*x).',
    expected: 'sin(pi*x)*sinh(pi*y)/sinh(pi)',
  },
  {
    id: 'tb-4',
    category: 'textbook',
    mode: 'math',
    question:
      'Solve the transport equation u_t + c u_x = 0 for x in R and t > 0 with initial condition u(x,0)=sin(x).',
    expected: 'sin(x-c*t)',
  },
  {
    id: 'tb-5',
    category: 'textbook',
    mode: 'math',
    question:
      'Solve u_xx + u_yy = -sin(pi*x)*sin(pi*y) on the unit square with zero boundary values on all four sides.',
    expected: 'sin(pi*x)*sin(pi*y)/(2*pi**2)',
  },
  {
    id: 'jee-1',
    category: 'jee',
    mode: 'math',
    question:
      'If u(x,t) = exp(-lambda*t)*sin(3*x) satisfies u_t = 4*u_xx, find lambda.',
    expected: '36',
  },
  {
    id: 'jee-2',
    category: 'jee',
    mode: 'math',
    question:
      'If u(x,t) = sin(2*x)*cos(4*t) satisfies u_tt = c^2*u_xx, find the positive value of c.',
    expected: '2',
  },
  {
    id: 'jee-3',
    category: 'jee',
    mode: 'math',
    question: 'For u(x,y) = x^2 - y^2, compute u_xx + u_yy.',
    expected: '0',
  },
  {
    id: 'jee-4',
    category: 'jee',
    mode: 'math',
    question: 'For u(x,y) = x^2 + y^2, compute u_xx + u_yy.',
    expected: '4',
  },
  {
    id: 'jee-5',
    category: 'jee',
    mode: 'math',
    question:
      'If u(x,y) = exp(x + 2*y), compute (u_x + u_y)/u.',
    expected: '3',
  },
  {
    id: 'plasma-1',
    category: 'plasma',
    mode: 'conceptual',
    question: 'Which PDE governs the electric potential and space charge in a plasma? Explain its terms.',
    expected:
      "Poisson's equation, e.g. nabla^2 phi = -rho/epsilon_0, where phi is the electric potential and rho is the net space charge from ions and electrons. It is coupled to charged-particle transport.",
  },
  {
    id: 'plasma-2',
    category: 'plasma',
    mode: 'conceptual',
    question:
      'Why are drift-diffusion and continuity equations used together in semiconductor plasma process simulation?',
    expected:
      'Drift-diffusion gives the charged-particle flux from electric-field drift and diffusion. Continuity conserves particle number by relating the flux divergence to sources and sinks from ionization, attachment, recombination, and surface reactions. Together they track electron and ion densities in the discharge and sheath.',
  },
  {
    id: 'plasma-3',
    category: 'plasma',
    mode: 'conceptual',
    question: 'What boundary conditions are needed at electrodes and the wafer in a plasma model?',
    expected:
      'Potentials or currents at powered/grounded electrodes, ion and electron fluxes, surface reaction rates, secondary-electron emission, and wafer charging or floating potential. These set sheath structure and surface treatment.',
  },
  {
    id: 'plasma-4',
    category: 'plasma',
    mode: 'conceptual',
    question: 'Compare FDM, FVM, and FEM for plasma simulation. What are their main trade-offs?',
    expected:
      'FDM is simple and efficient on regular grids but struggles with complex geometry. FVM is conservative and well suited to coupled transport fluxes on unstructured meshes. FEM handles complex geometry and adaptivity but is less naturally conservative. Plasma models often couple these fluid solvers with PIC/Monte Carlo collisions.',
  },
  {
    id: 'plasma-5',
    category: 'plasma',
    mode: 'conceptual',
    question: 'How can PINNs and neural surrogates accelerate plasma modelling in semiconductor manufacturing?',
    expected:
      'PINNs embed PDE and boundary-condition residuals in the training loss and can help with inverse problems and sparse data. Neural surrogates approximate expensive simulations for fast parameter sweeps, control, virtual metrology, and recipe optimization. Accuracy and validity outside the training range remain constraints.',
  },
];

const AskResponseSchema = z.object({
  answer: z.string(),
  verification: z.string().optional(),
});

const ExtractResponseSchema = z.object({
  sympy: z.string(),
});

const JudgeResponseSchema = z.object({
  pass: z.boolean(),
  reason: z.string(),
});

const VerifierResponseSchema = z.object({
  status: z.enum(['verified', 'failed', 'inconclusive']),
  message: z.string(),
});

interface CheckResult {
  passed: boolean;
  detail: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      const message = body['message'];
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    // Use the status below.
  }
  return `HTTP ${response.status}`;
}

async function ask(question: string): Promise<string> {
  const response = await fetch(`${apiUrl}/ask?stream=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    throw new Error(`/ask failed: ${await readErrorMessage(response)}`);
  }
  return parseJsonObject(await response.text(), AskResponseSchema).answer;
}

async function verifyExpressions(candidate: string, expected: string): Promise<CheckResult> {
  const response = await fetch(`${env.VERIFIER_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate, expected }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    return { passed: false, detail: `Verifier failed: ${await readErrorMessage(response)}` };
  }
  const body: unknown = await response.json();
  const parsed = VerifierResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { passed: false, detail: 'Verifier returned an unexpected response.' };
  }
  return {
    passed: parsed.data.status === 'verified',
    detail: `${parsed.data.status}: ${parsed.data.message}`,
  };
}

async function extractSympy(question: string, answer: string): Promise<string> {
  const prompt = `Extract the single final mathematical result from the assistant answer.
Return ONLY compact JSON: {"sympy": "<expression>"}.
Rules:
- Use Python/SymPy syntax, not LaTeX.
- Return the right-hand side only if the answer is an equation.
- Use diff(u(x,t), t), exp(), sin(), cos(), pi, alpha, and similar SymPy names.
- If there is no clear mathematical final result, return {"sympy": ""}.

Question:
${question}

Assistant answer:
${answer.slice(0, 12_000)}
`;
  const raw = await llm.generate(prompt);
  return parseJsonObject(raw, ExtractResponseSchema).sympy.trim();
}

async function checkMath(question: EvalQuestion, answer: string): Promise<CheckResult> {
  let candidate: string;
  try {
    candidate = await extractSympy(question.question, answer);
  } catch (error) {
    return {
      passed: false,
      detail: `Could not extract a SymPy answer: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!candidate) {
    return { passed: false, detail: 'No machine-readable final answer was found.' };
  }
  const result = await verifyExpressions(candidate, question.expected);
  return {
    passed: result.passed,
    detail: `candidate=${candidate}; expected=${question.expected}; ${result.detail}`,
  };
}

async function checkConceptual(question: EvalQuestion, answer: string): Promise<CheckResult> {
  const prompt = `You are grading an answer for a semiconductor plasma modelling benchmark.
Use the reference answer as the target. PASS only when the answer covers essentially all key
concepts and contains no serious factual error. Do not reward verbosity. Return ONLY compact JSON:
{"pass": true, "reason": "one short sentence"}

Question:
${question.question}

Reference answer:
${question.expected}

Candidate answer:
${answer.slice(0, 12_000)}
`;
  try {
    const raw = await llm.generate(prompt);
    const graded = parseJsonObject(raw, JudgeResponseSchema);
    return { passed: graded.pass, detail: graded.reason };
  } catch (error) {
    return {
      passed: false,
      detail: `Conceptual judge failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const apiUrl = (process.env['EVAL_API_URL'] ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
const llm = new LlmContext([
  new GroqLlmStrategy(),
  new OpenAiLlmStrategy(),
  new OllamaLlmStrategy(),
]);

async function main(): Promise<void> {
  console.log(`Running ${QUESTIONS.length}-question eval against ${apiUrl}`);
  console.log(`Active LLM strategy: ${llm.name}\n`);

  const failures: Array<{ id: string; detail: string }> = [];
  let passed = 0;

  for (const [index, item] of QUESTIONS.entries()) {
    const prefix = `[${index + 1}/${QUESTIONS.length}] ${item.id}`;
    try {
      const answer = await ask(item.question);
      const result =
        item.mode === 'math'
          ? await checkMath(item, answer)
          : await checkConceptual(item, answer);
      if (result.passed) {
        passed += 1;
        console.log(`${prefix} PASS — ${result.detail}`);
      } else {
        failures.push({ id: item.id, detail: result.detail });
        console.log(`${prefix} FAIL — ${result.detail}`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push({ id: item.id, detail });
      console.log(`${prefix} ERROR — ${detail}`);
    }
  }

  const accuracy = (passed / QUESTIONS.length) * 100;
  console.log(`\nAccuracy: ${passed}/${QUESTIONS.length} (${accuracy.toFixed(1)}%)`);

  if (failures.length > 0) {
    console.log('\nFailing questions:');
    for (const failure of failures) {
      console.log(`- ${failure.id}: ${failure.detail}`);
    }
  }

  if (accuracy < 80) {
    console.log('\nAccuracy is below 80%. Tune in this order:');
    console.log('1. chunk size / chunk overlap');
    console.log('2. prompt rules');
    console.log('3. few-shot examples');
    console.log('4. retrieval top-k');
  }

  console.log(
    '\nThis eval set is a starter only. Review the questions, expected answers, and passing threshold, then extend it with your own cases.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
