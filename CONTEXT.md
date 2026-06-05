# Domain Glossary

## Pipeline

An Orca-owned multi-stage automation run that consumes already prepared tasks, creates execution workspaces, dispatches agents, reviews completed work, merges successful branches, verifies results, and records run history.

## Pipeline Template

A named definition of a Pipeline's stages, prompts, required prompt arguments, structured output tag and schema, task-source behavior, and safety limits.

## Pipeline Run

One user-triggered or automation-triggered execution of a Pipeline Template against a repository, base branch, task source, and runtime settings.

## Pipeline PRD Work Set

A group of prepared task issues for one PRD, selected by provider repository, parent PRD issue, and exact derived `pipeline:prd-<PRD issue number>` label.

## PRD Candidate

A suggested PRD work set that Orca can show before launch so the user can choose prepared PRD work without manually typing the PRD issue number.

## Pipeline Iteration

One full planning cycle inside a Pipeline Run: planner output, planned tasks, implementation dispatch, review, merge, and verify. Multi-iteration runs re-plan after merge to pick up newly unblocked work.

## Pipeline Task

An Orca Pipeline record representing one prepared task selected by the planner, linked to its source issue, branch, managed worktree, orchestration task, terminals, stage results, and verification status.

## Pipeline Recovery Report

A user-facing summary that explains a previous Pipeline Run did not end normally and must be reviewed before starting a replacement run for the same PRD work set.

## Task Source

The configured source of prepared work items for a Pipeline Run. For Orca Pipeline task execution, the source is the PRD-labeled GitHub issue set.

## Dynamic Context

Output inserted into a prompt by running a command declared in the raw Pipeline Template. User-provided task text or prompt arguments must never become executable dynamic context commands.
