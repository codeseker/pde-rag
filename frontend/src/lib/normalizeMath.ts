const FENCED_CODE_BLOCK = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

function normalizeSegment(segment: string): string {
  return segment
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, equation: string) => {
      const body = equation.trim();
      return body ? `\n\n$$\n${body}\n$$\n\n` : "";
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, equation: string) => {
      const body = equation.replace(/\s*\n\s*/g, " ").trim();
      return body ? `$${body}$` : "";
    });
}

/**
 * Converts LaTeX delimiters emitted by LLMs into the dollar delimiters that
 * remark-math understands. Fenced code blocks are left byte-for-byte intact.
 */
export function normalizeMath(text: string): string {
  return text
    .split(FENCED_CODE_BLOCK)
    .map((part, index) => (index % 2 === 1 ? part : normalizeSegment(part)))
    .join("");
}
