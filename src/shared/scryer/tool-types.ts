export type ScryerToolName =
  | 'list_models'
  | 'set_model'
  | 'get_model'
  | 'get_node'
  | 'add_nodes'
  | 'set_node'
  | 'update_nodes'
  | 'delete_nodes'
  | 'add_edges'
  | 'update_edges'
  | 'delete_edges'
  | 'update_source_map'
  | 'set_flows'
  | 'delete_flow'
  | 'set_groups'
  | 'delete_group'
  | 'set_implementing'
  | 'get_rules'
  | 'validate_model'
  | 'get_task'
  | 'get_changes'
  | 'get_structure'
  | 'set_diagrams'
  | 'get_diagram'
  | 'delete_diagram'
  | 'update_diagram_refs'

export type ScryerToolCall = {
  toolName: ScryerToolName
  arguments: Record<string, unknown>
}

export type ScryerToolResult =
  | { ok: true; content: string; data?: unknown }
  | { ok: false; content: string; data?: unknown }
