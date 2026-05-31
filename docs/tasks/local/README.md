# Local Task Docs

GitHub Issues are preferred for PRD and task tracking. While Issues are disabled for `Nikolatesla-lj/orca`, this directory is the temporary task entry point for Scryer Diagram Library implementation.

Rules:

- Create one file per slice, for example `LOCAL-F1A.md`, split UI slices such as `LOCAL-S1A.md` and `LOCAL-S1B.md`, follow-up UX slices such as `LOCAL-S3A.md`, or split infrastructure slices such as `LOCAL-S7A.md` and `LOCAL-S7B.md`.
- If a parent summary exists, such as `LOCAL-S1.md`, do not code from it. Code only from the ready child task docs, such as `LOCAL-S1A.md` and `LOCAL-S1B.md`.
- Copy the strict task template from `../2026-05-26-scryer-diagram-library-task-slices.md`.
- Fill the full Context Checklist before coding.
- Link requirement IDs, contract sections, exact implementation names, fixture IDs, error codes, traceability rows, automated tests, and live evidence.
- Do not implement directly from PRD, UML, or the aggregate task-slices document.
- If GitHub Issues are later enabled, backfill each local task doc into a GitHub task issue before merge or release.
