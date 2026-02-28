# Testing

## Current Status

- Test runner: Bun (`bun test`, `bun run test`).
- Current coverage focuses on critical config behavior.
- TypeScript build/typecheck excludes `src/**/*.test.ts` (tests use Bun test globals/types).

## Single-Test Execution

- Single file: `bun test src/config.test.ts`
- Filter by test name: `bun test --test-name-pattern "missing key"`
- Watch mode: `bun test --watch`

## Rules for Agents

- Prefer running targeted tests first, then full test suite.
- Report exact command(s) executed and pass/fail result.

## If Tests Are Added Later

Update this file immediately with exact commands for:

- run one test file
- run one test case
- run tests in watch mode

Include the actual command syntax and any path filters.
