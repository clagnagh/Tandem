# 8. Run TypeScript directly with Node

Date: 2026-10-02. Status: Accepted.

## Context

The server, scripts and shared packages are TypeScript. Node 22.18+ strips
types natively, so it can run `.ts` files without a build step, provided the
code uses only erasable syntax (no `enum`, no `namespace`) and imports name
their `.ts` extension.

## Options

1. **Compile with `tsc` to `dist/`.** Two copies of the code, and workspace
   packages must be built before anything that imports them.
2. **Run with `tsx`.** Works for any syntax, one more dependency at runtime.
3. **Run with Node's built-in type stripping.**

## Decision

Option 3 for the server and scripts (`node src/index.ts`, `node --watch` in
development). `tsc --noEmit` does the type checking. The web app is built by
Next.js as usual. The shared tsconfig enables `erasableSyntaxOnly` and
`allowImportingTsExtensions` so the compiler enforces the rules.

## Consequences

- No build step for the server; the deployed image runs the source.
- Every relative import ends in `.ts`.
- If a library ever needs non-erasable syntax in our code, revisit this.
