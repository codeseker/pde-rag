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

function errorChain(error: unknown, depth = 0, seen = new Set<object>()): unknown[] {
  if (!error || depth > 6) {
    return [];
  }

  if (typeof error !== 'object') {
    return [error];
  }
  if (seen.has(error)) {
    return [];
  }
  seen.add(error);

  const record = error as { cause?: unknown; errors?: unknown };
  const chain: unknown[] = [error];

  // Drizzle wraps driver failures in Error.cause. pg-pool sometimes wraps the
  // individual connection attempts in an AggregateError, whose own message is
  // empty; without walking `errors` the health payload loses the real reason.
  if (record.cause && record.cause !== error) {
    chain.push(...errorChain(record.cause, depth + 1, seen));
  }
  if (Array.isArray(record.errors)) {
    for (const nested of record.errors) {
      chain.push(...errorChain(nested, depth + 1, seen));
    }
  }
  return chain;
}

/** A useful label even for errors (AggregateError) whose message is empty. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code =
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as unknown as { code: string }).code
        : null;
    const message = error.message.trim();
    if (message) {
      return code && !message.includes(code) ? `${message} [${code}]` : message;
    }
    return code ? `${error.name} [${code}]` : error.name;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; name?: unknown; code?: unknown };
    const code = typeof record.code === 'string' ? record.code : null;
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    if (message) {
      return code && !message.includes(code) ? `${message} [${code}]` : message;
    }
    const name = typeof record.name === 'string' ? record.name : 'Error';
    return code ? `${name} [${code}]` : name;
  }

  return '';
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
    const message = describeError(current);
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
