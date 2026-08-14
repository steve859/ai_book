# Project instructions

- Do not over-engineer.
- Keep the app simple and easy to explain.
- The workflow has exactly 5 user-triggered steps:
  1. Style
  2. Characters
  3. Portraits
  4. Chapters
  5. Illustrations

- Before making architectural changes, explain the trade-off.
- Do not silently introduce a database, queue, caching layer, or new framework.
- Prefer small, readable functions.
- Keep TypeScript strict.
- Do not modify unrelated files.
- Run lint/typecheck/tests after meaningful changes.
- If you notice a questionable design decision, push back instead of blindly implementing it.
- Decisions that involve real trade-offs may be candidates for DECISIONS.md, but do not invent or back-fill decisions.
