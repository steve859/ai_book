# Techstack:

- Frontend: React + Vite + Typescript
- Backend: Nodejs + Express + Typescript
- Storage: SQLite
- Gemini API: REST API using fetch

## API Contract

### POST /api/session

Create or load a user session from name and email.

### DELETE /api/session

Sign out.

### GET /api/projects

List the current user's projects.

### POST /api/projects

Create a project from title and book text.

### GET /api/projects/:projectId

Load full project state.

### POST /api/projects/:projectId/steps/style

Run the Style step.

### POST /api/projects/:projectId/steps/characters

Run the Characters step.

### POST /api/projects/:projectId/steps/portraits

Run the Portraits step.

### POST /api/projects/:projectId/steps/chapters

Run the Chapters step.

### POST /api/projects/:projectId/steps/illustrations

Run the Illustrations step.

### POST /api/projects/:projectId/steps/:step/retry

Clear a failed or stale running step so the user can run that step again.
