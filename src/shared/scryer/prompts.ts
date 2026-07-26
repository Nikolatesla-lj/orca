import type { C4ModelData, DriftReport } from './model-types'

function stripCompact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripCompact).filter((item) => item !== undefined)
  }
  if (typeof value !== 'object' || value === null) {
    return value === '' ? undefined : value
  }

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'position' || key === 'type' || key === 'refPositions' || key === 'notes') {
      continue
    }
    const next = stripCompact(item)
    if (
      next === undefined ||
      next === null ||
      (Array.isArray(next) && next.length === 0) ||
      (typeof next === 'object' && !Array.isArray(next) && Object.keys(next).length === 0)
    ) {
      continue
    }
    output[key] = next
  }
  return output
}

export function serializeModelForPrompt(model: C4ModelData): string {
  return JSON.stringify(stripCompact(model))
}

export function initialModelPrompt(modelName: string, cwd: string): string {
  return `You have access to Orca's Scryer-compatible architecture MCP tools. Build a C4 architecture model named "${modelName}" from the codebase at ${cwd}.

Instructions:
1. Call get_rules to load the modeling workflow and C4 rules.
2. Call get_structure with path "${cwd}" to get the annotated directory tree.
3. Read the manifests surfaced by get_structure.
4. Build the model level by level: set_model for persons/systems/system edges, then add_container for each container and add_links for container-level edges.
5. Stop at the container level unless the user explicitly asked for component detail.
6. Set status "implemented" on nodes that already exist in code. Use "proposed" for new planned work.
7. Set source mappings with update_source_map.
8. Call get_changes to summarize what was modeled.`
}

// Why: the visible Fill with AI is the Container Generation entry point (#73). The
// agent builds one complete proposal and commits it with a single atomic run of the
// `orca scryer container fill` CLI — the product path per ADR 0004 (the Orca CLI
// replaces the Scryer MCP for writes). The retired legacy set_node path is no longer
// offered, the Engine never falls back to it, and the agent never folds or decides the
// terminal state (Orca's completion gate owns that).
export function nodeFillPrompt(args: {
  modelName: string
  cwd: string
  nodeId: string
  nodeName: string
  nodeKind: string
  modelJson: string
}): string {
  return `You have access to Orca's Scryer-compatible architecture tools and the \`orca scryer\` CLI. Fill out the internals of "${args.nodeName}" in model "${args.modelName}" from ${args.cwd} using Container Generation.

Current model state:
${args.modelJson}

Instructions:
1. Call get_rules to load the modeling workflow and C4 rules.
2. Call get_structure with path "${args.cwd}" and read the source files that implement "${args.nodeName}" (id "${args.nodeId}") so you understand its real components, their relationships, and boundaries.
3. Assemble ONE complete JSON proposal for the internals of "${args.nodeName}": "container_id" "${args.nodeId}", a non-empty "components" array (each component a local "key", a "name", and its "symbols" with their "source_file"), and any "links" and "groups" between those components. Reference components only by their local keys; never invent node ids.
4. Run \`orca scryer container fill --json-input -\` in this terminal EXACTLY ONCE, piping that JSON proposal on stdin (for example with a heredoc). This single command atomically generates the whole container subtree.

Constraints:
- Build the internals ONLY through that single \`orca scryer container fill\` command. Do not use the retired per-node mutation tools, node subtree edits, or any other legacy path to add components one by one.
- If \`orca scryer container fill\` (the Engine) fails, do NOT fall back to a legacy tool and do NOT retry with a per-node mutation — stop and report the failure verbatim.
- Do NOT fold, mark nodes implemented, or otherwise decide whether the result is accepted. Orca's completion gate owns the terminal state of the generated subtree.
- Focus only on "${args.nodeName}". Do not change anything outside this container's scope.`
}

export function advisorPrompt(args: { modelName: string; cwd: string; modelJson: string }): string {
  return `You have access to Orca's Scryer-compatible architecture MCP tools. Review the C4 architecture model "${args.modelName}" for structural issues in the codebase at ${args.cwd}.

Current model state:
${args.modelJson}

Instructions:
1. Call get_rules to load the C4 modeling rules.
2. Inspect the model for missing relationships, unclear names, wrong hierarchy, unsupported status changes, missing source maps, and contract gaps.
3. Read source files only when the current model is ambiguous.
4. Do not modify the model unless the user explicitly asks you to apply the recommendations.
5. Return a concise review grouped by node or flow, with concrete suggested fixes.`
}

export function syncPrompt(args: {
  modelName: string
  cwd: string
  drift: DriftReport
  modelJson: string
}): string {
  const driftList =
    args.drift.nodes.length > 0
      ? args.drift.nodes
          .map(
            (node) =>
              `- **${node.nodeName}** (${node.nodeId}): changed files matching: ${node.patterns.join(', ')}`
          )
          .join('\n')
      : '- No source-mapped nodes changed.'

  const structureSection = args.drift.structureChanged
    ? '\nProject structure changes were detected. Call get_structure to check whether new code needs to be added to the model or removed code should be cleaned up.\n'
    : ''

  return `You have access to Orca's Scryer-compatible architecture MCP tools. The architecture model "${args.modelName}" may be out of sync with the codebase at ${args.cwd}.

Potentially drifted nodes:
${driftList}
${structureSection}
Current model state:
Do NOT call get_model. The current state is provided here:
${args.modelJson}

Instructions:
1. For each drifted node, read the changed source files and decide whether the architecture changed.
2. Update the model only where the code actually diverged: update_nodes, add_nodes, delete_nodes, add_edges, update_edges, delete_edges, update_source_map, set_flows, or set_groups.
3. Call get_changes to produce a summary.

Do not change contract passed flags. Do not call get_task or start implementing code. Be conservative: only change what actually diverged.`
}
