import { callScryerTool } from '../main/scryer/mcp-tools'
import type { ScryerToolName } from '../shared/scryer/model-types'

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
  return `Run the Orca Scryer architecture tool "${name}" for the configured project.`
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
        }
      })
    }
    case 'ping':
      return result(id, {})
    case 'tools/list':
      return result(id, {
        tools: TOOL_NAMES.map((name) => ({
          name,
          description: toolDescription(name),
          inputSchema: {
            type: 'object',
            additionalProperties: true
          }
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
