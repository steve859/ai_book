# AI Book Illustration Studio

A local web application that turns a `.txt` book into character portraits and a chapter illustration using the Gemini API.

The workflow contains exactly five user-triggered steps:

1. Style
2. Characters
3. Portraits
4. Chapters
5. Illustrations

Each step must be started manually. Completing one step does not automatically start the next.

## Tech Stack

- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- Storage: SQLite and the local filesystem
- AI: Gemini REST API using `fetch`
- Tests: Vitest, Testing Library, and Supertest

## Requirements

- Node.js 20 or later
- npm
- A Gemini API key only when running with the real Gemini client

## Setup

Create the environment file:

```bash
cp .env.example .env
```

For quota-free local development:

```env
GEMINI_MODE=mock
MOCK_GEMINI_DELAY_MS=750
MOCK_GEMINI_FAIL_STEP=
```

For real Gemini generation:

```env
GEMINI_MODE=real
GEMINI_API_KEY=your-api-key
GEMINI_TEXT_MODEL=gemini-3.6-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

The Gemini API key is read only by the backend and must not be exposed to the frontend.

## Run the Application

Start the frontend and backend with one command:

```bash
./start.sh
```

Alternatively:

```bash
npm install
npm run dev
```

Development URLs:

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health check: http://localhost:3000/api/health

## Run Tests

Run lint, type checking, and all tests:

```bash
./test.sh
```

Or run them separately:

```bash
npm run lint
npm run typecheck
npm test
```

Tests use fake clients or mocked HTTP responses and do not consume Gemini quota.

## Mock Gemini

Mock mode supports the complete five-step workflow without making external API calls. It returns deterministic text and PNG fixtures, and includes a short configurable delay so running states remain visible during development.

To force a step to fail and test retry behavior, set one of the five step names:

```env
MOCK_GEMINI_FAIL_STEP=style
```

Allowed values are `style`, `characters`, `portraits`, `chapters`, and `illustrations`. Clear the value and restart the backend to return to successful mock responses.

## Pipeline State

Completed progress is stored separately from the current execution state:

```text
status:
created -> style_done -> characters_done -> portraits_done -> chapters_done -> done

step_state:
idle | running | failed
```

SQLite conditional updates allow only one request to claim a step. Duplicate requests receive `409 Conflict` and do not trigger duplicate Gemini calls. Failed or stale running steps can be cleared only through the user-triggered Retry endpoint.

## Hard Limits

The backend enforces:

- Maximum 2 adult characters
- Maximum 1 chapter
- One portrait per character
- One illustration per chapter

## Storage

Runtime data is stored locally:

```text
server/data/
  app.db
  books/
  images/
```

SQLite stores users, projects, pipeline state, prompts, and asset paths. Book text and generated images are stored on the filesystem.

## Project Structure

```text
client/              React frontend
server/src/db/       SQLite schema and repositories
server/src/gemini/   Real and fake Gemini clients
server/src/pipeline/ Pipeline transition rules
server/src/routes/   Express API routes
shared/              Shared TypeScript types
docs/                Architecture and implementation notes
```

## API Overview

```text
POST   /api/session
DELETE /api/session

GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId

POST   /api/projects/:projectId/steps/style
POST   /api/projects/:projectId/steps/characters
POST   /api/projects/:projectId/steps/portraits
POST   /api/projects/:projectId/steps/chapters
POST   /api/projects/:projectId/steps/illustrations

POST   /api/projects/:projectId/steps/:step/retry
```

Project endpoints require the HTTP-only session cookie created by `POST /api/session`.

## Documentation

- [Architecture](docs/architecture.md)
- [Implementation plan](docs/plan.md)
- [Testing evidence](TESTING.md)
- [Engineering decisions](DECISIONS.md)
