import type { ContentType, ChunkMetadata } from '../database/schema';

const PLASMA_PATTERN =
  /\bplasma\b|semiconductor|wafer|etch(?:ing)?|deposition|sheath|drift[- ]diffusion|debye|boltzmann|vlasov|pinch|tokamak|reactor/i;
const JEE_PATTERN = /\bjee\b|\biit\b|multiple[- ]choice|\bmcq\b|options?\s*[:(]|\bassertion\b|\breason\b/i;
const SOLVED_PATTERN = /\bsolution\b|\banswer\b|worked example|\bsolve\b|therefore|\bhence\b/i;

export function detectContentType(content: string): ContentType {
  if (PLASMA_PATTERN.test(content)) {
    return 'plasma_application';
  }
  if (JEE_PATTERN.test(content)) {
    return 'jee_question';
  }
  if (SOLVED_PATTERN.test(content)) {
    return 'solved_example';
  }
  return 'theory';
}

export function detectPdeCategory(content: string): string {
  const text = content.toLowerCase();
  if (/\bmaxwell\b|electromagnetic wave|curl\s+e|div\s+d/.test(text)) {
    return 'Maxwell';
  }
  if (/schr[oö]dinger|quantum/.test(text)) {
    return 'Schrodinger';
  }
  if (/navier[- ]stokes|fluid flow|vorticity/.test(text)) {
    return 'Navier-Stokes';
  }
  if (/burgers/.test(text)) {
    return 'Burgers';
  }
  if (/poisson|nabla\s*\^?2\s*u\s*=\s*-?\s*rho|space charge/.test(text)) {
    return 'Poisson';
  }
  if (/laplace|harmonic|nabla\s*\^?2\s*u\s*=\s*0/.test(text)) {
    return 'Laplace';
  }
  if (/\bwave\b|d'?alembert|hyperbolic|u_?tt/.test(text)) {
    return 'wave';
  }
  if (/\bheat\b|diffusion|parabolic|u_?t\s*=/.test(text)) {
    return 'heat';
  }
  if (/first[- ]order|transport|advection|characteristics/.test(text)) {
    return 'first-order';
  }
  return 'general';
}

export function buildMetadata(
  content: string,
  page: number | undefined,
  pinned: boolean,
): ChunkMetadata {
  return {
    ...(page === undefined ? {} : { page }),
    contentType: detectContentType(content),
    pdeCategory: detectPdeCategory(content),
    ...(pinned ? { pinned: true } : {}),
  };
}
