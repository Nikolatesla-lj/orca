export type DiagramPromptInstructionContext =
  | 'initial-model'
  | 'node-fill'
  | 'deep-build'
  | 'sync'
  | 'advisor'
  | 'task-implementation'
  | 'mcp-rules'

export function buildDiagramPromptInstructions(context: DiagramPromptInstructionContext): string {
  const common = [
    '## Diagram guidance',
    '',
    '- Diagrams are optional top-level `diagrams` entries linked to C4 nodes, flows, flow steps, groups, edges, or source files through `diagramRefs`.',
    '- Diagrams support architecture, sequence, state, class/data, deployment, and other Mermaid detail that would make the C4 or flow tree too noisy.',
    '- Diagrams never replace C4 hierarchy, flows, contracts, source maps, tests, or implementation evidence.',
    '- Default compact prompt data omits full `diagram.source`; use `sourceHash` and `sourceOmitted` to detect omitted source.',
    '- Use `get_diagram` before editing omitted diagram source.',
    '- Update an existing diagram before creating a duplicate with the same design intent.',
    '- When creating or updating a diagram, keep it linked with `update_diagram_refs` so future code and sync work has a concrete C4, flow, or source target.'
  ]

  const contextLines: Record<DiagramPromptInstructionContext, string[]> = {
    'initial-model': [
      '- The initial system/container modeling pass normally skips diagram creation unless the user explicitly requested diagrams.',
      '- Do not create diagrams while discovering the top-level C4 boundary unless a diagram is part of the user request.'
    ],
    'node-fill': [
      '- At most one proactive supplemental diagram may be created for the scoped node.',
      '- Create that diagram only when a C4 subtree would hide meaningful state, sequence, class/data, or deployment detail.',
      '- If you create it, call `update_diagram_refs` to link it to the scoped node or a source target before finishing.'
    ],
    'deep-build': [
      '- Add a Diagram recovery pass after flow and contract recovery.',
      '- In Diagram recovery, inspect existing linked diagrams, call `get_diagram` before editing omitted source, use `set_diagrams` to update diagram source, and use `update_diagram_refs` to maintain links.',
      '- Create diagrams only for complex behavior, data/state shape, deployment/runtime detail, or explicit user requests.'
    ],
    sync: [
      '- Check the "Potentially drifted diagrams" section before editing diagrams.',
      '- If a drifted diagram has omitted source, call `get_diagram` before editing it.',
      '- Update diagrams only when changed code invalidates the diagram and the linked target is in sync scope.'
    ],
    advisor: [
      '- Report missing or stale diagrams when a diagram would clarify complex behavior or when an existing diagram is unlinked or outdated.',
      '- Do not mutate diagrams unless the user explicitly asks the advisor to apply changes.'
    ],
    'task-implementation': [
      '- Linked diagrams are implementation context for the listed task scope.',
      '- Read compact summaries first; call `get_diagram` only when the full source is needed for implementation or update.',
      '- If code changes invalidate a linked diagram and the diagram target is in scope, update the diagram and its `diagramRefs` in the same task.',
      '- Unlinked diagrams are not enough to change code without resolving a C4, flow, or source target first.'
    ],
    'mcp-rules': [
      '- Keep C4 and flow trees clean; put detailed Mermaid views in top-level `diagrams`.',
      '- Link diagrams through top-level `diagramRefs`; do not nest diagram refs inside nodes, edges, flows, or sourceMap.',
      '- External tools should fetch omitted diagram source with `get_diagram` before editing.'
    ]
  }

  return [...common, ...contextLines[context]].join('\n')
}
