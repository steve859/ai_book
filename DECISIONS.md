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
