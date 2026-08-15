# Decisions

## SQLite instead of JSON files

Codex initially proposed storing each project's state in JSON files to keep the system simple. I pushed back because the workflow has concurrent state changes and must prevent duplicate Gemini calls from double-clicks, refreshes, or multiple tabs. Making JSON safe for those cases would require implementing locking and atomic writes ourselves.

I chose SQLite for users, projects, and pipeline state, while keeping book text and generated images on the local filesystem as required. The cost is having schema, but gives me transactions and atomic state updates without introducing a separate database server. I think that a better trade-off than building around JSON files.

## Use Client-Server Architecture

## Use FakeGemini Client instead of Gemini in development

## Separate completed progress from current execution state

I store completed progress separately from the current running step. status keeps the last completed step, while step_state and running_step track what is currently running or failed. This allows the user to retry a failed step without losing previous progress. The trade-off is having a few extra columns and state rules.

## Claim pipeline steps with an atomic SQLite update

I use one SQLite update to start a pipeline step. The update only succeeds if the previous step is completed and no other step is running.

This prevents two requests from running the same step and calling Gemini twice. The trade-off is slightly more complex SQL and concurrency testing.

## Run pipeline steps synchronously without a job queue

Codex suggested using BullMQ for background jobs, but I decided not to use it because the pipeline only has five sequential steps and BullMQ would add unnecessary complexity.

Each step runs directly in the Express request. SQLite is used to make sure the same step cannot run twice at the same time.

This keeps the system simple. The trade-off is that a long Gemini request depends on the server process, and a restart may leave a step marked as running until it is reset.

## Store book text, generated images as files

I store uploaded book text and generated images on the local filesystem. SQLite stores only their relative paths together with the structured project data.

This keeps the database small and allows Express to serve generated images directly. It also avoids encoding image blobs during normal project queries. The trade-off is that the database and data directory must be backed up and moved together, and deleting a project requires cleaning up both database rows and files.
