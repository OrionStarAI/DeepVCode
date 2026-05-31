/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Placeholder integration-test runner for the open-source distribution.
//
// The full end-to-end / integration suite (the real test cases plus the
// original run-tests.js harness) is not bundled with the open-source release
// of DeepV Code. The `test:e2e` and `test:integration:*` npm scripts still
// point here so they fail gracefully with a clear explanation instead of a
// cryptic "Cannot find module integration-tests/run-tests.js" error, and so
// `eslint integration-tests` has a file to lint. See issue #34.

const sandbox = process.env.GEMINI_SANDBOX ?? 'false';

console.log(
  '\n[integration-tests] Skipped: the end-to-end / integration test suite is ' +
    'not included in the open-source distribution of DeepV Code.',
);
console.log(
  `[integration-tests] (requested sandbox mode: GEMINI_SANDBOX=${sandbox})`,
);
console.log(
  '[integration-tests] Unit tests remain available, e.g.: npx vitest run <file>\n',
);

// Exit 0 so this counts as a graceful skip rather than a hard failure:
// test:ci does not invoke these scripts, and a missing E2E suite should not
// look like a broken build to contributors.
process.exit(0);
