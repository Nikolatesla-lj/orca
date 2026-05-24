/* eslint-disable max-lines -- Why: this CLI bridge keeps the MCP protocol handlers, tool descriptions, and input schemas together so the public Scryer tool contract stays auditable. */
import { callScryerTool } from '../main/scryer/mcp-tools'
import type { ScryerToolName } from '../shared/scryer/model-types'
import { MCP_INSTRUCTIONS } from '../shared/scryer/rules'

type JsonRpcId = string | number | null

type JsonRecord = Record<string, unknown>
type InputMode = 'unknown' | 'framed' | 'line'
type AsyncReadable = NodeJS.ReadableStream & AsyncIterable<Buffer | string>

type JsonRpcResponse =
  | {
      jsonrpc: '2.0'
      id: JsonRpcId
      result: unknown
    }
  | {
      jsonrpc: '2.0'
      id: JsonRpcId
      error: {
        code: number
        message: string
      }
    }

const TOOL_NAMES: ScryerToolName[] = [
  'list_models',
  'set_model',
  'get_model',
  'get_node',
  'add_nodes',
  'set_node',
  'update_nodes',
  'delete_nodes',
  'add_edges',
  'update_edges',
  'delete_edges',
  'update_source_map',
  'set_flows',
  'delete_flow',
  'set_groups',
  'delete_group',
  'set_implementing',
  'get_rules',
  'validate_model',
  'get_task',
  'get_changes',
  'get_structure'
]

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getId(message: JsonRecord): JsonRpcId {
  const id = message.id
  return typeof id === 'string' || typeof id === 'number' || id === null ? id : null
}

function getParams(message: JsonRecord): JsonRecord {
  return isRecord(message.params) ? message.params : {}
}

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result: value }
}

function error(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function frameResponse(response: JsonRpcResponse): string {
  const body = JSON.stringify(response)
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
}

function detectInputMode(buffer: Buffer, currentMode: InputMode): InputMode {
  if (currentMode !== 'unknown') {
    return currentMode
  }
  const text = buffer.toString('utf8', 0, Math.min(buffer.length, 128)).trimStart()
  if (!text) {
    return 'unknown'
  }
  const lower = text.toLowerCase()
  if (lower.startsWith('content-length:')) {
    return 'framed'
  }
  if ('content-length:'.startsWith(lower)) {
    return 'unknown'
  }
  if (text.startsWith('{') || text.includes('\n')) {
    return 'line'
  }
  return 'unknown'
}

function toolDescription(name: ScryerToolName): string {
  const descriptions: Record<ScryerToolName, string> = {
    list_models:
      'List available architecture models for the configured project. Use this before selecting or inspecting a model.',
    set_model:
      'Create or overwrite a model with complete data in one call. Use for initial model creation or full rewrites. Pass the full model JSON with all nodes and edges; UI position data is handled automatically.',
    get_model:
      'Read the current architecture model. Returns compact JSON with UI-only fields stripped so agents can understand the diagram state.',
    get_node:
      'Read one node with its descendants, internal edges, external edges, source map, and group context. Use this before filling or implementing a scoped subtree.',
    add_nodes:
      'Add one or more nodes to a model. Hierarchy: person/system top-level, container under system, component under container, operation/process/model under component.',
    set_node:
      'Replace all descendants of an existing node in one call. Use this to detail a system with containers or a container with components without repeated add_node calls.',
    update_nodes:
      'Patch one or more existing nodes. Use for status, descriptions, technology labels, contracts, notes, and source map updates. Omitted fields stay unchanged.',
    delete_nodes:
      'Delete one or more nodes and their descendant nodes from the model. Related edges and source map entries are cleaned up.',
    add_edges: 'Add one or more relationship edges between nodes.',
    update_edges: 'Update one or more existing relationship edges.',
    delete_edges: 'Delete one or more relationship edges from the model.',
    update_source_map:
      'Set source file locations for one or more nodes or flows. Pass entries: [{ node_id, locations: [{ pattern, line?, endLine?, command? }] }]. Empty locations clears a mapping.',
    set_flows:
      'Create or replace behavior flows that model user journeys, pipelines, or deployment sequences. data must be a JSON string containing a single flow object or an array of flow objects, not { flows: [...] }.',
    delete_flow: 'Delete a behavior flow by ID.',
    set_groups:
      'Create or replace deployment or ownership groups. Use groups for containers that deploy together or belong to a shared runtime.',
    delete_group: 'Delete a group by ID. Members are ungrouped, not deleted.',
    set_implementing:
      'Tell Orca Scryer whether an implementation or sync run is active. Active runs suppress drift detection noise.',
    get_rules:
      'Get the C4 modeling rules that govern how diagrams should be structured and how agents should model, implement, and verify work.',
    validate_model:
      'Validate a model against C4 rules. Returns warnings for invalid hierarchy, disconnected relationships, missing mention edges, and cross-container component edges.',
    get_task:
      'Get the next implementation task. Returns one logical work unit at a time, ordered by dependencies. Workflow: get_task -> build -> update_nodes implemented -> get_task again.',
    get_changes:
      'Show what changed in a model since the agent last read or wrote it. Returns a human-readable diff of nodes, edges, contracts, flows, and groups.',
    get_structure:
      'Get the structure of a project directory. Returns an annotated directory tree showing manifests, infrastructure configs, and environment templates.'
  }
  return descriptions[name]
}

function toolInputSchema(name: ScryerToolName): JsonRecord {
  const stringSchema = { type: 'string' }
  const sourceLocationSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['pattern'],
    properties: {
      pattern: {
        type: 'string',
        description: 'File glob or file path, for example src/api/**/*.ts'
      },
      line: { type: 'number' },
      endLine: { type: 'number' },
      command: {
        type: 'string',
        description: 'Optional command that verifies this node or flow, useful for flow test links'
      }
    }
  }
  const modelNameProperty = {
    model: {
      type: 'string',
      description: 'Optional model name. Omit to use the project-local .scryer/model.scry.'
    }
  }

  switch (name) {
    case 'set_model':
      return {
        type: 'object',
        additionalProperties: false,
        required: ['data'],
        properties: {
          ...modelNameProperty,
          data: {
            type: 'string',
            description:
              'Full C4ModelData JSON string. Node fields must be inside data; contracts use data.contract: {expect, ask, never}.'
          }
        }
      }
    case 'set_node':
      return {
        type: 'object',
        additionalProperties: false,
        required: ['node_id', 'data'],
        properties: {
          ...modelNameProperty,
          node_id: stringSchema,
          data: {
            type: 'string',
            description:
              'JSON string with {nodes, edges}. Every node must be a descendant of node_id and place name/kind/status/contract under data.'
          }
        }
      }
    case 'update_source_map':
      return {
        type: 'object',
        additionalProperties: false,
        required: ['entries'],
        properties: {
          ...modelNameProperty,
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['node_id', 'locations'],
              properties: {
                node_id: stringSchema,
                locations: {
                  type: 'array',
                  description: 'Source locations. Use [] only to clear the source map for node_id.',
                  items: sourceLocationSchema
                }
              }
            }
          }
        }
      }
    case 'set_flows':
      return {
        type: 'object',
        additionalProperties: false,
        required: ['data'],
        properties: {
          ...modelNameProperty,
          data: {
            type: 'string',
            description:
              'JSON string for one flow object or an array of flows. Flow shape: {id, name, description?, steps:[{id, description, branches?}]}.'
          }
        }
      }
    default:
      return {
        type: 'object',
        additionalProperties: true
      }
  }
}

export async function handleScryerMcpMessage(
  projectPath: string,
  message: unknown
): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return error(null, -32600, 'Invalid JSON-RPC request')
  }

  const id = getId(message)
  const method = message.method
  if (!('id' in message)) {
    return null
  }

  switch (method) {
    case 'initialize': {
      const params = getParams(message)
      return result(id, {
        protocolVersion:
          typeof params.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'orca-scryer',
          version: '1.0.0'
        },
        instructions: MCP_INSTRUCTIONS
      })
    }
    case 'ping':
      return result(id, {})
    case 'tools/list':
      return result(id, {
        tools: TOOL_NAMES.map((name) => ({
          name,
          description: toolDescription(name),
          inputSchema: toolInputSchema(name)
        }))
      })
    case 'tools/call': {
      const params = getParams(message)
      const name = params.name
      if (typeof name !== 'string' || !TOOL_NAMES.includes(name as ScryerToolName)) {
        return error(id, -32602, 'Unknown Scryer MCP tool')
      }
      const callResult = await callScryerTool(projectPath, {
        toolName: name as ScryerToolName,
        arguments: isRecord(params.arguments) ? params.arguments : {}
      })
      return result(id, {
        content: [{ type: 'text', text: callResult.content }],
        isError: !callResult.ok
      })
    }
    case 'resources/list':
      return result(id, { resources: [] })
    case 'prompts/list':
      return result(id, { prompts: [] })
    default:
      return error(id, -32601, `Method not found: ${method}`)
  }
}

async function handleJsonText(
  projectPath: string,
  text: string,
  writeResponse: (response: JsonRpcResponse) => void
): Promise<void> {
  if (!text.trim()) {
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    writeResponse(error(null, -32700, 'Parse error'))
    return
  }

  try {
    const response = await handleScryerMcpMessage(projectPath, parsed)
    if (response) {
      writeResponse(response)
    }
  } catch (serverError) {
    const message = serverError instanceof Error ? serverError.message : String(serverError)
    const id = isRecord(parsed) ? getId(parsed) : null
    writeResponse(error(id, -32603, message))
  }
}

async function flushFramedMessages(
  projectPath: string,
  output: NodeJS.WritableStream,
  buffer: Buffer
): Promise<Buffer> {
  let remaining = buffer
  for (;;) {
    const headerEnd = remaining.indexOf('\r\n\r\n')
    if (headerEnd === -1) {
      return remaining
    }
    const headerText = remaining.subarray(0, headerEnd).toString('ascii')
    const lengthMatch = /^content-length:\s*(\d+)$/im.exec(headerText)
    if (!lengthMatch) {
      output.write(frameResponse(error(null, -32600, 'Missing Content-Length header')))
      return Buffer.alloc(0)
    }

    const contentLength = Number.parseInt(lengthMatch[1], 10)
    const bodyStart = headerEnd + 4
    const messageEnd = bodyStart + contentLength
    if (remaining.length < messageEnd) {
      return remaining
    }

    const body = remaining.subarray(bodyStart, messageEnd).toString('utf8')
    remaining = remaining.subarray(messageEnd)
    await handleJsonText(projectPath, body, (response) => {
      output.write(frameResponse(response))
    })
  }
}

async function flushLineMessages(
  projectPath: string,
  output: NodeJS.WritableStream,
  buffer: Buffer,
  final: boolean
): Promise<Buffer> {
  let remaining = buffer
  for (;;) {
    const lineEnd = remaining.indexOf('\n')
    if (lineEnd === -1) {
      break
    }
    const line = remaining.subarray(0, lineEnd).toString('utf8').replace(/\r$/, '')
    remaining = remaining.subarray(lineEnd + 1)
    await handleJsonText(projectPath, line, (response) => {
      output.write(`${JSON.stringify(response)}\n`)
    })
  }
  if (final && remaining.toString('utf8').trim()) {
    await handleJsonText(projectPath, remaining.toString('utf8'), (response) => {
      output.write(`${JSON.stringify(response)}\n`)
    })
    return Buffer.alloc(0)
  }
  return remaining
}

export async function runScryerMcpServer(
  projectPath: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): Promise<void> {
  let buffer: Buffer = Buffer.alloc(0)
  let mode: InputMode = 'unknown'

  for await (const chunk of input as AsyncReadable) {
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
    mode = detectInputMode(buffer, mode)
    if (mode === 'framed') {
      buffer = await flushFramedMessages(projectPath, output, buffer)
    } else if (mode === 'line') {
      buffer = await flushLineMessages(projectPath, output, buffer, false)
    }
  }

  if (mode === 'line' || mode === 'unknown') {
    await flushLineMessages(projectPath, output, buffer, true)
  }
}
