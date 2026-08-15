# Decisions

## SQLite instead of JSON files

Codex initially proposed storing each project's state in JSON files to keep the system simple. I pushed back because the workflow has concurrent state changes and must prevent duplicate Gemini calls from double-clicks, refreshes, or multiple tabs. Making JSON safe for those cases would require implementing locking and atomic writes ourselves.

I chose SQLite for users, projects, and pipeline state, while keeping book text and generated images on the local filesystem as required. The cost is having schema, but gives me transactions and atomic state updates without introducing a separate database server. I think that a better trade-off than building around JSON files.

## Use real and fake Gemini clients behind one interface

I initially asked whether a local open-source model should replace Gemini during development. Codex pushed back because that would add model hosting and would not exercise the same API behavior. I chose a deterministic fake client behind the same interface, with configurable delay and forced failure, so the full workflow and retry behavior can be tested without quota or network access. Real mode uses REST with gemini-3.6-flash for text and gemini-2.5-flash-image from the Nano Banana family for images, plus structured JSON and a persisted Gemini Files reference so the book is reused across steps and server restarts while the reference is valid. The cost is that mock tests cannot prove real model quality or API availability, so I still performed a limited real end-to-end run.

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

# If i had one more day

I would add one API integration test that drives a project through all five endpoints with the fake Gemini client. The current route tests cover every step and transition independently, but a single complete workflow test would better catch mismatches between consecutive steps without consuming Gemini quota.
