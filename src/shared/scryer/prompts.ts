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

## Instructions

1. Call \`get_rules\` to load the full modeling workflow and C4 rules.
2. Call \`get_structure\` with path "${cwd}" to get the annotated directory tree.
3. Read the manifests that \`get_structure\` surfaces (package.json, Cargo.toml, go.mod, etc.) to identify runtime dependencies, external services, databases, and frameworks.
4. Build the model level by level - follow the workflow from \`get_rules\`:
   - First: \`set_model\` with persons, the system, external systems, and system-level edges only. Fix any warnings before proceeding.
   - Second: \`set_node\` on the system to add all containers plus container-level edges (Person -> Container, Container -> Container, Container -> ExternalSystem). Fix any warnings.
   - Group containers that deploy together using \`set_groups\`.
5. Stop at the container level. Do NOT add components or operations unless the user explicitly asked for component detail.
6. Set \`status: "implemented"\` on all nodes that already exist in the codebase. Do NOT use "verified" - that requires contract items to be checked and passed.
7. Set source mappings for containers using \`update_source_map\` - use glob patterns pointing to each container's directory.
8. Call \`get_changes\` to produce a summary of what was modeled.

Be thorough - identify all deployable units, data stores, external integrations, background workers, and user-facing surfaces. Model for production, not for demos. Name nodes by their role, not their technology.`
}

export function nodeFillPrompt(args: {
  modelName: string
  cwd: string
  nodeId: string
  nodeName: string
  nodeKind: string
  modelJson: string
}): string {
  const childKind =
    args.nodeKind === 'system'
      ? 'containers (applications, services, data stores)'
      : args.nodeKind === 'container'
        ? 'components (logical modules within the container)'
        : args.nodeKind === 'component'
          ? 'operations (functions/methods), processes (multi-step flows), and models (data types)'
          : 'child nodes'

  const extraInstructions =
    args.nodeKind === 'system'
      ? `
   - Add all containers: APIs, web apps, workers, databases, message queues, caches.
   - Set \`technology\` on every container, for example "Next.js", "PostgreSQL", or "Redis".
   - Add edges between containers showing data flow and dependencies.
   - Group containers that deploy together using \`set_groups\`.`
      : args.nodeKind === 'container'
        ? `
   - Identify logical components by reading the source directories mapped to this container.
   - Components should represent cohesive modules - not one per file, but logical groupings.
   - Add edges between components showing internal dependencies.
   - Set \`technology\` where relevant, such as a framework or library.`
        : args.nodeKind === 'component'
          ? `
   - Read the source files for this component to identify functions, methods, and data types.
   - Operations = individual functions or handlers. The name must be a valid identifier and match the language convention.
   - Processes = multi-step workflows that orchestrate multiple operations.
   - Models = data types with properties. Name them with the language's type naming convention.
   - Add descriptions explaining what each operation, process, or model does.`
          : ''

  return `You have access to Orca's Scryer-compatible architecture MCP tools. Fill out the internals of "${args.nodeName}" in model "${args.modelName}" from ${args.cwd}.

## Current model state

Do NOT call \`get_model\` - the current state is provided here:

${args.modelJson}

## Instructions

1. Call \`get_rules\` to load the C4 modeling rules.
2. Call \`get_node\` with id "${args.nodeId}" to see this node's full context (description, contract, source mappings, existing edges).
3. Use \`get_structure\` with path "${args.cwd}" and read relevant source files to understand what ${childKind} belong inside "${args.nodeName}".
4. Add ${childKind} using \`set_node\` on "${args.nodeId}" - include both child nodes and edges between them.${extraInstructions}
5. Set \`status: "implemented"\` on nodes that already exist in the codebase. Leave new planned items as \`status: "proposed"\`.
6. Update source mappings for new nodes using \`update_source_map\` with glob patterns.
7. Call \`get_changes\` to produce a summary.

Focus only on "${args.nodeName}" - do not modify nodes outside this scope. Be thorough - identify all ${childKind} from the actual code, not just the obvious ones.`
}

export function deepModelPrompt(args: {
  modelName: string
  cwd: string
  modelJson: string
}): string {
  return `You have access to Orca's Scryer-compatible architecture MCP tools. Build a Deep Architecture B model named "${args.modelName}" from the current codebase at ${args.cwd}.

This is the deep code-to-model workflow. Follow the same phased approach as Scryer App: create the system/container view first, then fill containers, then recover flows and contracts. Do not implement code.

## Current model state

Do NOT call \`get_model\` - the current state is provided here:

${args.modelJson}

## Workflow

1. Call \`get_rules\` to load the full C4 modeling workflow and tool rules.
2. Call \`get_structure\` with path "${args.cwd}" and read surfaced manifests, docs, tests, and user-flow files.

### Phase 1 - Initial model: systems and containers

- If the current model is empty or missing the system/container view, follow the official initial modeling flow:
  - Use \`set_model\` for persons, systems, external systems, and system-level edges only.
  - Use \`set_node\` on the owned system to add containers and container-level edges.
  - Use \`set_groups\` for containers that deploy together.
- Stop at the container level in this phase. Do NOT add components, operations, models, or flows during initial modeling.
- Set \`status: "implemented"\` for nodes that clearly exist in the current code. Do NOT set any node to "verified".
- Use \`update_source_map\` for each container with glob patterns that point at its source directory or files.

### Phase 2 - Fill with AI: container internals

- For each non-external container that belongs to the codebase, call \`get_node\` for each container before editing it.
- Read the container's source-mapped files and nearby tests.
- use \`set_node\` to add components under that container and include component-level edges.
- Components should be cohesive code modules, not one component per file.
- Prefer schema or database setup components over trivial health-check routes when deciding what deserves component-level space.
- Keep work scoped to that container. Do not rename or restructure systems or containers unless the code proves the current boundary is wrong; if a boundary is wrong, report it for human review.
- Update source maps for every component using \`update_source_map\`.

### Phase 3 - Flow extraction

- read tests, end-to-end specs, user-flow docs, and README files to identify behavior flows.
- Prefer product-level acceptance flows from tests and user docs.
- Do not create separate CRUD or API-only flows unless the docs or tests name them as user-visible journeys.
- use \`set_flows\` to create or update user journeys, data pipelines, deployment sequences, or other multi-step behavior.
- Use sequential steps for the happy path and branches only for real decision points with at least two alternatives.
- link each flow ID with \`update_source_map\` when a test or scenario file exists. Include a \`command\` when there is a direct test command.

### Phase 4 - Contract recovery

- Recover contract items from docs, tests, user-facing assertions, and the current model state above.
- Recover contracts for every container and component named in docs or tests, not only for top-level containers.
- Store contracts only in the official Orca/Scryer shape: \`data.contract: { expect, ask, never }\`.
- Put inherited requirements on the highest accurate node. Only add child contracts when the child has a more specific rule.
- preserve existing \`passed\` flags exactly. New or recovered \`expect\` items must not be marked passed unless the current model already had that exact passed item.
- Do not delete existing contract items unless the source document or current code proves they are obsolete.

### Phase 5 - Sync rule

- If the current model already has reviewed structure, only update model parts that the current code actually changed or that are missing deep detail.
- During sync, only update model parts that the current code actually changed.
- Do not model generic runtime capabilities as external systems unless source code directly calls that runtime capability as an architectural dependency.
- Prefer \`update_nodes\`, \`update_source_map\`, \`set_node\`, \`set_flows\`, and edge update tools over full rewrites after the initial system/container view exists.
- Use \`status: "vagrant"\` only for existing code discovered during sync that was not part of the reviewed model.
- Do NOT change contract \`passed\` flags, Do NOT set any node to "verified", and Do NOT call \`get_task\`.

### Phase 6 - Validate and report

- Call \`validate_model\` after each major phase and fix warnings that can be fixed inside the current scope.
- Call \`get_changes\` at the end.
- Report what was created, what was preserved, what was intentionally skipped, and any boundary changes that need human approval.`
}

export function advisorPrompt(args: { modelName: string; cwd: string; modelJson: string }): string {
  return `You have access to Orca's Scryer-compatible architecture MCP tools. Review the C4 architecture model "${args.modelName}" for structural issues in the codebase at ${args.cwd}.

## Current model state

${args.modelJson}

## Instructions

1. Call \`get_rules\` to load the C4 modeling rules.
2. Inspect the model using the same checks as Scryer's AI advisor:
   - Technology-stuffed names - node names should describe roles, not list technologies.
   - Missing or misleading relationships - flag likely missing connections or edges pointing the wrong way.
   - Structural issues - for example client-side SPAs talking directly to databases, hidden queues, or components too abstract to map to code.
   - Authority hierarchy violations - lower-level nodes that do not fit their parent boundary.
   - Flow step granularity - flag UI gestures like "clicks button" when the step should describe a system interaction.
   - Missing production infrastructure - authentication, input validation, error handling, migrations, rate limiting, observability, or similar concrete gaps.
   - Placeholder nodes - names like "TBD" or vague descriptions like "handles security".
3. Do not flag empty descriptions, missing technology fields, or unlabeled edges by themselves.
4. Read source files only when the current model is ambiguous.
5. Do not modify the model unless the user explicitly asks you to apply the recommendations.
6. Return a concise review grouped by node or flow, with concrete suggested fixes and severity.`
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
    ? '\n## Project structure changes\n\nNew or deleted files were detected in the project since the last sync. Call `get_structure` to see the current project layout, then check whether any new code needs to be added to the model or any removed code should be cleaned up.\n'
    : ''

  return `You have access to Orca's Scryer-compatible architecture MCP tools. The architecture model "${args.modelName}" may be out of sync with the codebase at ${args.cwd}.

## Potentially drifted nodes

The following nodes have source files that were modified since the model was last updated. The code may or may not have changed in ways that affect the model - check each one.

${driftList}
${structureSection}
## Current model state

Do NOT call \`get_model\` - the current state is provided here:

${args.modelJson}

## Instructions

1. For each drifted node above, read the changed source files to understand what, if anything, changed.
2. Update the model only where the code has actually diverged:
   - Fix descriptions, technology labels, status, or source maps with \`update_nodes\` and \`update_source_map\`
   - Add new structures with \`add_nodes\` using status "vagrant" if the code introduced something the model does not cover - these are existing code being added to the model, not proposals
   - Remove nodes with \`delete_nodes\` if the code deleted what the model still shows
   - Add, update, or remove edges with \`add_edges\`, \`update_edges\`, or \`delete_edges\` if relationships changed
   - Update flows or groups with \`set_flows\` or \`set_groups\` only when the code change actually affects them
3. Call \`get_changes\` to produce a summary.

Do NOT call \`get_model\` - the model state is already above. Do NOT call \`get_rules\` unless you need to create entirely new architectural structures.

Be conservative - only change what actually diverged. If nothing needs updating, say so. Report what you changed and why.

## Off limits

Do NOT do any of the following - these require verification from the user:
- Do not change contract expect item \`passed\` flags
- Do not change node status from "implemented" to "verified"
- Do not call \`get_task\` or start implementing code`
}
