# CLAUDE.md

- **SPEC.md is the source of truth.** Read `SPEC.md` and `docs/NOTES.md` before starting any work.
- When you finish, append a dated entry tagged `[Claude]` to `docs/NOTES.md` (e.g. `- 2026-10-27 [Claude] …`).
- Never rewrite another author's entries. Only append, or mark them resolved.
- Changes go through PR branches, never directly to `main`.

## Commands (from package.json, Node 20.19+)

```sh
npm ci
npm test        # vitest run (unit tests in tests/)
npm run build   # tsc && vite build → dist/
npm run dev     # local dev server
```
