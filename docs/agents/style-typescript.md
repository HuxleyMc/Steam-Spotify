# TypeScript and Style Conventions

Derived from `src/*.ts`, `.prettierrc`, and `tsconfig.json`.

## Formatting

- Use 2 spaces.
- Do not use tabs.
- Keep code Prettier-compatible.

## Imports

- Use ES import syntax.
- Prefer Node built-ins with `node:` specifiers.
- Keep external imports before internal relative imports.
- Internal imports should be relative and extensionless.

## TypeScript

- `strict` mode is required; do not weaken compiler options.
- Avoid `any`, `@ts-ignore`, and `@ts-expect-error`.
- Add explicit types for exported APIs.
- Keep response types close to the code that consumes them.
- Use narrow type assertions only after runtime validation.

## Naming

- Functions/variables: `camelCase`.
- Types: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants.
- Environment keys: uppercase names.

## Existing Local Naming Quirk

`initConfig()` returns `PascalCase` field names (`ClientId`, `SteamUsername`).
Preserve local consistency unless you are doing a dedicated naming cleanup.

## Async and Control Flow

- Use `async/await` for orchestration.
- Event-based APIs may be wrapped in `Promise` for startup flow.
- Keep polling/interval loops guarded with try/catch.
