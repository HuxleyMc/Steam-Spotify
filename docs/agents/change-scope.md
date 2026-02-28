# Change Scope and Workflow Guardrails

## Scope

- Keep changes minimal and focused.
- Avoid unrelated refactors during bug fixes.
- Preserve user-facing behavior unless the task explicitly changes behavior.

## When Editing

- Read the target module and its immediate collaborator module first.
- Follow existing repo patterns before introducing new abstractions.
- Update `README.md` when setup or command behavior changes.

## Verification Before Completion

Run in order:

1. `bun run format:check`
2. `bun run typecheck`
3. `bun run build`

If one fails, fix and re-run before finalizing.
