# Project instructions

- A webapp that turns a book(.txt) into character portraits and a chapter illustration using Gemini API.
- Do not over-engineer.
- Keep the app simple and easy to explain.

# Required Pipeline

The workflow has exactly five user-triggered steps:

1. Style
2. Characters
3. Portraits
4. Chapters
5. Illustrations

- Do not automatically start the next step.

# Hard limits

- Maximum 2 adult characters
- Maximum 1 chapter
- One portrait per character
- One illustration per chapter

# Gemini mechanics

Follow Google's Book Illustration notebook.

- Upload/send book content once.
- Reuse Gemini context through interaction chaining.
- Use structured JSON for characters and chapters.
- Use a current Gemini text model.
- Use a current Nano Banana image model.
- Preserve character consistency in chapter illustrations.

# Engineering constraints

- Keep the solution lean.
- Do not introduce infrastructure without a concrete need.
- Persist workflow state.
- Refresh must restore progress.
- Prevent duplicate Gemini calls.
- Failed/stale steps must be retryable.
- Store book text and generated images on local filesystem.

# AI behavior

Before making significant architecture decisions:

- Explain the proposed approach;
- Identify trade-offs;
- Push back if my approach violates the assessment;
- Before making architectural changes, explain the trade-off.
- Do not silently introduce a database, queue, caching layer, or new framework.
- Prefer small, readable functions.
- Keep TypeScript strict.
- Do not modify unrelated files.
- Run lint/typecheck/tests after meaningful changes.
- If you notice a questionable design decision, push back instead of blindly implementing it.
- Decisions that involve real trade-offs may be candidates for DECISIONS.md, but do not invent or back-fill decisions.
