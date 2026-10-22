#!/usr/bin/env node
'use strict';

// Docker HEALTHCHECK target. Render uses its own healthCheckPath (/health),
// but the same endpoint works for local `docker run` verification.
const port = process.env.PORT || '10000';

async function main() {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  const body = (await response.text()).slice(0, 1000);
  if (!response.ok) {
    console.error(`healthcheck: HTTP ${response.status} ${body}`);
    process.exit(1);
  }
  console.log(`healthcheck: HTTP ${response.status} ${body}`);
}

main().catch((error) => {
  console.error(`healthcheck: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
