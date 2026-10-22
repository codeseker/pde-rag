/**
 * A small, deliberately narrow classification of PostgreSQL/network errors
 * that mean "the database is temporarily unreachable" rather than "the request
 * or the schema is invalid".
 *
 * Mapping these to HTTP 503 lets the browser/health check see a truthful
 * dependency failure instead of an opaque 500, while still preserving real
 * validation and programming errors.
 *
 * Drizzle wraps driver failures, so both the classifier and the log formatter
 * walk the Error.cause chain.
 */

const UNAVAILABLE_CODES = new Set([
  // libpq / node-postgres connection errors
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EPIPE',
  // PostgreSQL class 08 - connection exception
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  // PostgreSQL shutdown / startup / capacity
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  // Authentication/configuration failures also mean the API cannot use the DB.
  '28P01', // invalid_password
  '28000', // invalid_authorization_specification
]);

const UNAVAILABLE_MESSAGE_PATTERNS = [
  'econnrefused',
  'econnreset',
  'enotfound',
  'etimedout',
  'ehostunreach',
  'enetunreach',
  'connection terminated',
  'connection closed',
  'connection refused',
  'timeout expired',
  'server closed the connection',
  'the database system is starting up',
  'the database system is shutting down',
  'too many clients',
  'no pg_hba.conf entry',
];

function errorChain(error: unknown, depth = 0): unknown[] {
  if (!error || depth > 6) {
    return [];
  }

  const record =
    typeof error === 'object' && error !== null
      ? (error as { cause?: unknown })
      : null;
  if (!record) {
    return [error];
  }

  const chain: unknown[] = [error];
  if (record.cause && record.cause !== error) {
    chain.push(...errorChain(record.cause, depth + 1));
  }
  return chain;
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  for (const current of errorChain(error)) {
    if (!current || typeof current !== 'object') {
      continue;
    }

    const record = current as { code?: unknown; message?: unknown };
    if (typeof record.code === 'string') {
      if (UNAVAILABLE_CODES.has(record.code) || record.code.startsWith('08')) {
        return true;
      }
    }

    const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
    if (UNAVAILABLE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))) {
      return true;
    }
  }

  return false;
}

/** Removes credentials before an error is written to logs or a health payload. */
export function redactSecrets(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://***@')
    .replace(/(password|passwd|pwd|api[_-]?key|secret|token)=([^&\s]+)/gi, '$1=***');
}

/** Formats an error chain without repeating the same message at every level. */
export function errorMessage(error: unknown): string {
  const messages: string[] = [];
  for (const current of errorChain(error)) {
    const message =
      current instanceof Error
        ? current.message
        : typeof current === 'string'
          ? current
          : '';
    if (message && !messages.includes(message)) {
      messages.push(message);
    }
  }
  return redactSecrets(messages.length > 0 ? messages.join(' <- ') : String(error));
}

/** A log-safe database target: host/database only, never user:password. */
export function describeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const port = parsed.port ? `:${parsed.port}` : '';
    const database = parsed.pathname.replace(/^\/+/, '') || '(default)';
    return `${parsed.protocol}//${parsed.hostname}${port}/${database}`;
  } catch {
    return 'invalid DATABASE_URL';
  }
}
