# Testing

Last verified: August 15, 2026.

## Automated checks

Run all checks from the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The latest full test run passed 46 tests across 8 test files:

- Client UI: sign in, session restore, project list and empty state, project details, named running state, failed state, and retry action.
- Session API: create, restore, validate, and clear cookie-based sessions.
- Project API: authentication, project ownership, project creation, book storage, and full project loading.
- Five-step pipeline: Style, Characters, Portraits, Chapters, and Illustrations execute in the required order and persist their output.
- Retry behavior: failed steps and stale running steps can be reset; fresh running steps cannot be retried.
- SQLite repositories: user normalization, project hydration, hard limits, database constraints, and atomic step transitions.
- Gemini REST client: API key validation, one-time book upload reuse, persisted reference reuse after a client restart, structured generation, and image response decoding. Network calls are mocked in these tests.
- Mock Gemini client: deterministic output for all five steps and forced failures for retry testing.

## Manual end-to-end test

The complete workflow was tested through the React client with the Express API and SQLite database:

1. Signed in and created the `german colony 2` project from a text book.
2. Ran Style and saved `anime`.
3. Ran Characters and generated two adult characters: Governor Dr. Hahl and Queen Emma.
4. Ran Portraits and generated one portrait for each character.
5. Ran Chapters and generated one chapter prompt.
6. Ran Illustrations and generated one illustration for that chapter.
7. Confirmed the final project showed all five steps complete, with `status = done`, no running step, and the saved prompts and images.

The real Gemini Characters request was also retested after replacing the unavailable `gemini-2.5-flash` text model with `gemini-3.6-flash`.

## Additional manual cases tested

- Calling a step from the wrong project state returns `409 Conflict`.
- Retrying a fresh `running` step returns `409 Conflict`.
- A failed or stale step can be reset before the user starts it again.
- Illustrations cannot run before Chapters has completed.
- Refreshing project data returns persisted styles, characters, chapters, portrait paths, and illustration paths from SQLite.

## Development testing without Gemini usage

Use mock mode to exercise the full workflow without making Gemini API calls:

```env
GEMINI_MODE=mock
MOCK_GEMINI_DELAY_MS=750
```

To test the failure and retry UI, set one pipeline step to fail:

```env
MOCK_GEMINI_FAIL_STEP=characters
```

Valid values are `style`, `characters`, `portraits`, `chapters`, and `illustrations`. Restart the server after changing environment variables.

## Latest test report

This is the relevant output from a real `./test.sh` run on August 15, 2026:

```text
> lint
> npm run lint --workspaces --if-present

> typecheck
> npm run typecheck --workspaces --if-present

> test
> npm run test --workspaces --if-present

RUN  v1.6.1 client
✓ src/ui/App.test.tsx  (5 tests)
Test Files  1 passed (1)
Tests       5 passed (5)

RUN  v1.6.1 server
✓ src/gemini/fakeClient.test.ts       (2 tests)
✓ src/pipeline/steps.test.ts          (3 tests)
✓ src/pipeline/pipelineService.test.ts (2 tests)
✓ src/gemini/client.test.ts           (4 tests)
✓ src/db/repositories.test.ts         (9 tests)
✓ src/routes/session.test.ts          (5 tests)
✓ src/routes/projects.test.ts         (16 tests)
Test Files  7 passed (7)
Tests       41 passed (41)

> build
> npm run build --workspace server && npm run build --workspace client

vite v5.4.21 building for production...
✓ 1583 modules transformed.
✓ built in 1.01s
```

## Not covered

- Automated browser screenshots, visual regression tests, and full browser E2E. Component and route integration tests cover the important states with less setup for this assessment's scope.
- Real Gemini failure modes such as rate limits, service outages, and interrupted uploads.
- Concurrent execution across multiple Node.js server processes. Atomic SQLite updates are tested within the current single-server architecture.
