# Decisions

## SQLite instead of JSON files

Codex initially proposed storing each project's state in JSON files to keep the system simple. I pushed back because the workflow has concurrent state changes and must prevent duplicate Gemini calls from double-clicks, refreshes, or multiple tabs. Making JSON safe for those cases would require implementing locking and atomic writes ourselves.

I chose SQLite for users, projects, and pipeline state, while keeping book text and generated images on the local filesystem as required. The cost is having schema, but gives me transactions and atomic state updates without introducing a separate database server. I think that a better trade-off than building around JSON files.

## Use Client-Server Architecture
