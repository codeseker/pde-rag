import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeDatabaseUrl,
  errorMessage,
  isDatabaseUnavailableError,
  redactSecrets,
} from './database-errors';

test('classifies connection failures as unavailable', () => {
  assert.equal(isDatabaseUnavailableError({ code: 'ECONNREFUSED' }), true);
  assert.equal(isDatabaseUnavailableError({ code: '08006' }), true);
  assert.equal(isDatabaseUnavailableError({ code: '57P01' }), true);
  assert.equal(
    isDatabaseUnavailableError(new Error('Connection terminated unexpectedly')),
    true,
  );
});

test('finds driver failures wrapped by Drizzle', () => {
  const wrapped = new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"', {
    cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    }),
  });
  assert.equal(isDatabaseUnavailableError(wrapped), true);
  assert.match(errorMessage(wrapped), /ECONNREFUSED/);
});

test('does not hide validation or schema errors', () => {
  assert.equal(isDatabaseUnavailableError({ code: '23505' }), false);
  assert.equal(isDatabaseUnavailableError({ code: '42P01' }), false);
  assert.equal(isDatabaseUnavailableError(new Error('text must be at least 20 characters')), false);
});

test('redacts credentials from logs', () => {
  const message = 'connect failed: postgresql://pde:supersecret@db.example.com:5432/pde';
  const redacted = redactSecrets(message);
  assert.equal(redacted.includes('supersecret'), false);
  assert.equal(redacted.includes('postgresql://***@'), true);
  assert.equal(errorMessage(new Error(message)).includes('supersecret'), false);
});

test('describes a database without leaking credentials', () => {
  const description = describeDatabaseUrl('postgresql://pde:supersecret@db.example.com:5432/pde');
  assert.equal(description, 'postgresql://db.example.com:5432/pde');
  assert.equal(description.includes('supersecret'), false);
});
