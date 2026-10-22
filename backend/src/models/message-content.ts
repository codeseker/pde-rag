function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Flattens the string and text-block forms returned by LangChain chat models. */
export function messageContentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (isRecord(part) && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
}
