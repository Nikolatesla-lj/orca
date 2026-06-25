# Scryer agent runs use Orca execution adapters

Scryer agent-run semantics are preserved, but Orca owns Codex/Claude process launch, account state, terminal/runtime state, and UI integration. A Scryer Agent Run Bridge hides adapter mechanics so Scryer workflows can use Orca runtime capabilities without duplicating them.
