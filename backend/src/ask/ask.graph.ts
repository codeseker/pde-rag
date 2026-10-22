import { Inject, Injectable, Logger } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import { env } from '../config/env';
import { ChunkRepository, type RetrievedChunk } from '../database/chunk.repository';
import { EmbeddingContext } from '../models/embedding.context';
import type {
  IMathVerifier,
  VerifyMathResponse,
} from '../models/interfaces/math-verifier.interface';
import { LlmContext } from '../models/llm.context';
import { MATH_VERIFIER } from '../models/tokens';
import {
  AskState,
  ClassificationSchema,
  SolutionSchema,
  type AskStateUpdate,
  type AskStateValue,
  type QueryType,
  type SolveResult,
  type Verification,
} from './ask.state';
import { parseJsonObject } from './json';
import { fillTemplate, loadPrompts, type PromptSet } from './prompt-loader';

export interface Source {
  label: string;
  documentId: string;
  title: string;
  page?: number;
  contentType?: string;
  pdeCategory?: string;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  sources: Source[];
  verification: Verification;
}

const REFUSAL =
  'I can help with PDE solutions, PDE-based plasma modelling, and semiconductor manufacturing applications. This question is outside that scope.';

@Injectable()
export class AskGraph {
  private readonly logger = new Logger(AskGraph.name);
  private readonly prompts: PromptSet;
  private readonly graph: ReturnType<AskGraph['createGraph']>;

  constructor(
    private readonly llm: LlmContext,
    private readonly embeddings: EmbeddingContext,
    private readonly repository: ChunkRepository,
    @Inject(MATH_VERIFIER) private readonly verifier: IMathVerifier,
  ) {
    this.prompts = loadPrompts();
    this.graph = this.createGraph();
  }

  async run(question: string): Promise<AskResult> {
    const state = await this.graph.invoke({ question });
    return {
      answer: formatAnswer(state),
      sources: toSources(state.chunks),
      verification: state.verification,
    };
  }

  private createGraph() {
    return new StateGraph(AskState)
      .addNode('classify', this.classify.bind(this))
      .addNode('retrieve', this.retrieve.bind(this))
      .addNode('solve', this.solve.bind(this))
      .addNode('verify', this.verify.bind(this))
      .addEdge(START, 'classify')
      .addConditionalEdges('classify', this.afterClassify.bind(this), {
        retrieve: 'retrieve',
        [END]: END,
      })
      .addEdge('retrieve', 'solve')
      .addEdge('solve', 'verify')
      .addEdge('verify', END)
      .compile();
  }

  private async classify(state: AskStateValue): Promise<AskStateUpdate> {
    const prompt = fillTemplate(this.prompts.classify, { QUESTION: state.question });
    let queryType: QueryType;
    try {
      const raw = await this.llm.generate(prompt);
      queryType = parseJsonObject(raw, ClassificationSchema).queryType;
    } catch {
      queryType = classifyByKeywords(state.question);
    }

    if (queryType === 'out_of_scope') {
      const keywordType = classifyByKeywords(state.question);
      if (keywordType !== 'out_of_scope') {
        queryType = keywordType;
      }
    }

    if (queryType === 'out_of_scope') {
      return {
        queryType,
        chunks: [],
        verification: 'not_applicable',
        solution: {
          steps: [REFUSAL],
          final_answer_latex: '',
          final_answer_sympy: '',
          pde_sympy: '',
          conditions_sympy: [],
        },
      };
    }

    return { queryType };
  }

  private async retrieve(state: AskStateValue): Promise<AskStateUpdate> {
    const vector = await this.embeddings.embedQuery(state.question);
    const chunks = await this.repository.similaritySearch(
      vector,
      this.embeddings.name,
      env.TOP_K,
    );
    return { chunks };
  }

  private async solve(state: AskStateValue): Promise<AskStateUpdate> {
    if (state.chunks.length === 0) {
      return {
        solution: {
          steps: ['Insufficient context: no relevant knowledge has been fed yet.'],
          final_answer_latex: '',
          final_answer_sympy: '',
          pde_sympy: '',
          conditions_sympy: [],
        },
      };
    }

    const template =
      state.queryType === 'plasma_semiconductor' ? this.prompts.plasma : this.prompts.solve;
    const prompt = fillTemplate(template, {
      CONTEXT: formatContext(state.chunks, env.MAX_CONTEXT_CHARS),
      QUESTION: state.question,
    });

    const raw = await this.llm.generate(prompt);

    if (state.queryType === 'plasma_semiconductor') {
      return {
        solution: {
          steps: [raw.trim() || 'The model returned an empty response. Please try again.'],
          final_answer_latex: '',
          final_answer_sympy: '',
          pde_sympy: '',
          conditions_sympy: [],
        },
      };
    }

    try {
      const solution = parseJsonObject(raw, SolutionSchema);
      return { solution };
    } catch (error) {
      this.logger.warn(
        `Could not parse model response as a solution (${error instanceof Error ? error.message : String(error)}). Raw response: ${raw.slice(0, 4000)}`,
      );
      const fallback = salvagePlainText(raw);
      return {
        solution: {
          steps: [
            fallback ||
              'The model did not return a usable structured solution. Please retry the question or feed clearer source material.',
          ],
          final_answer_latex: '',
          final_answer_sympy: '',
          pde_sympy: '',
          conditions_sympy: [],
        },
      };
    }
  }

  private async verify(state: AskStateValue): Promise<AskStateUpdate> {
    if (state.queryType !== 'pde_solve') {
      return { verification: 'not_applicable', verificationMessage: '' };
    }

    const solution = state.solution;
    if (!solution?.pde_sympy.trim() || !solution.final_answer_sympy.trim()) {
      return {
        verification: 'inconclusive',
        verificationMessage:
          'The answer did not include a machine-checkable PDE and SymPy candidate expression.',
      };
    }

    const result: VerifyMathResponse = await this.verifier.verify({
      pde: /\bu\s*\(/.test(solution.pde_sympy)
        ? solution.pde_sympy
        : solution.pde_sympy.replace(/\bz\s*\(/g, 'u('),
      candidate: solution.final_answer_sympy,
      conditions: solution.conditions_sympy,
    });

    return {
      verification: result.status,
      verificationMessage: result.message,
    };
  }

  private afterClassify(state: AskStateValue): 'retrieve' | typeof END {
    return state.queryType === 'out_of_scope' ? END : 'retrieve';
  }
}

function salvagePlainText(raw: string): string {
  const text = raw.trim();
  if (!text || text.startsWith('{') || text.startsWith('[') || text.startsWith('```')) {
    return '';
  }
  return text;
}

function classifyByKeywords(question: string): QueryType {
  const text = question.toLowerCase();
  if (
    /\bplasma\b|semiconductor|wafer|etch|deposition|sheath|drift-diffusion|pe-?cvd|sputter|chamber|transistor|mosfet|lithography|doping|carrier transport|thin film/.test(
      text,
    )
  ) {
    return 'plasma_semiconductor';
  }
  if (
    /\bpde\b|partial differential|partial derivative|heat equation|wave equation|laplace|poisson|u_\{?t\}?|\buxx\b|\butt\b|separation of variables|boundary condition|initial condition|characteristics?|canonical form|sturm-liouville|green'?s function/.test(
      text,
    )
  ) {
    return 'pde_solve';
  }
  if (
    /\b(lagrange|charpit|clairaut|first[- ]order|arbitrary function|general solution|pfaffian|exact differential)\b/.test(
      text,
    )
  ) {
    return 'pde_solve';
  }
  if (/\bp\s*[+\-]\s*\d*\s*q\b/.test(text) || /\bz\s*_\s*[xy]\b/.test(text)) {
    return 'pde_solve';
  }
  return 'out_of_scope';
}

function formatContext(chunks: RetrievedChunk[], maxChars: number): string {
  const blocks: string[] = [];
  let used = 0;

  for (const [index, chunk] of chunks.entries()) {
    const page = chunk.metadata.page ? `, page ${chunk.metadata.page}` : '';
    const type = chunk.metadata.contentType ?? 'theory';
    const category = chunk.metadata.pdeCategory ?? 'general';
    const block = `[S${index + 1}] ${chunk.title}${page} (${type}, ${category})\n${chunk.content}`;
    const separator = blocks.length === 0 ? 0 : 2;
    const remaining = maxChars - used - separator;

    if (remaining <= 0) {
      break;
    }
    if (block.length > remaining) {
      if (blocks.length === 0) {
        blocks.push(`${block.slice(0, Math.max(0, remaining - 14)).trimEnd()}\n[truncated]`);
      }
      break;
    }

    blocks.push(block);
    used += block.length + separator;
  }

  return blocks.join('\n\n');
}

function escapeSourceText(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 320 ? `${compact.slice(0, 317)}...` : compact;
}

function toSources(chunks: RetrievedChunk[]): Source[] {
  return chunks.map((chunk, index) => ({
    label: `S${index + 1}`,
    documentId: chunk.documentId,
    title: chunk.title,
    ...(chunk.metadata.page === undefined ? {} : { page: chunk.metadata.page }),
    ...(chunk.metadata.contentType === undefined
      ? {}
      : { contentType: chunk.metadata.contentType }),
    ...(chunk.metadata.pdeCategory === undefined
      ? {}
      : { pdeCategory: chunk.metadata.pdeCategory }),
    excerpt: escapeSourceText(chunk.content),
  }));
}

function ensureLatex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('$') || trimmed.startsWith('\\[') || trimmed.startsWith('\\(')) {
    return trimmed;
  }
  return `$$\n${trimmed}\n$$`;
}

function formatAnswer(state: AskStateValue): string {
  const solution: SolveResult | null = state.solution;
  if (!solution) {
    return 'No answer could be produced.';
  }

  const body = solution.steps.map((step) => step.trim()).filter(Boolean).join('\n\n');
  const final = solution.final_answer_latex.trim();
  const finalBlock = final
    ? state.queryType === 'plasma_semiconductor'
      ? `**Executive summary**\n\n${final}`
      : `**Final answer**\n\n${ensureLatex(final)}`
    : '';

  const verificationNote =
    state.verification === 'failed'
      ? `\n\n> **Verification failed.** ${state.verificationMessage} Treat this result as unverified.`
      : state.verification === 'inconclusive'
        ? `\n\n> **Verification inconclusive.** ${state.verificationMessage}`
        : '';

  return cleanupAnswer([body, finalBlock].filter(Boolean).join('\n\n') + verificationNote);
}

function cleanupAnswer(text: string): string {
  return text
    .replace(/\?\\\(/g, ' \\(')
    .replace(/\\\)\?/g, '\\)')
    .replace(/\?\[\?S(\d+)\?\]/g, ' [S$1]')
    .replace(/\?\[\?S(\d+)\]/g, ' [S$1]')
    .replace(/\[\?S(\d+)\?\]/g, ' [S$1]')
    .replace(/\[\?S(\d+)\]/g, ' [S$1]')
    .replace(/\?\[S(\d+)\?\]/g, ' [S$1]')
    .replace(/\?\[S(\d+)\]/g, ' [S$1]')
    .replace(/\u3010S(\d+)[^\u3011]*\u3011/g, ' [S$1]')
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ');
}
