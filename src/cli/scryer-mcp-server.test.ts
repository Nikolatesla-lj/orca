import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { PassThrough, Writable } from 'stream'
import { afterEach, describe, expect, it } from 'vitest'
import { handleScryerMcpMessage, runScryerMcpServer } from './scryer-mcp-server'

describe('handleScryerMcpMessage', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createProject(): Promise<string> {
    const projectPath = await mkdtemp(join(tmpdir(), 'orca-scryer-mcp-cli-'))
    tempDirs.push(projectPath)
    return projectPath
  }

  it('answers initialize and exposes Scryer tools', async () => {
    const projectPath = await createProject()

    await expect(
      handleScryerMcpMessage(projectPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' }
      })
    ).resolves.toMatchObject({
      id: 1,
      result: {
        capabilities: { tools: {} },
        serverInfo: { name: 'orca-scryer' },
        instructions: expect.stringContaining('## C4 Hierarchy')
      }
    })

    await expect(
      handleScryerMcpMessage(projectPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    ).resolves.toMatchObject({
      id: 2,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: 'set_model',
            description: expect.stringContaining(
              'Create or overwrite a model with complete data in one call'
            )
          }),
          expect.objectContaining({
            name: 'get_structure',
            description: expect.stringContaining('annotated directory tree')
          }),
          expect.objectContaining({
            name: 'get_task',
            description: expect.stringContaining('Get the next implementation task')
          }),
          expect.objectContaining({
            name: 'update_source_map',
            inputSchema: expect.objectContaining({
              properties: expect.objectContaining({
                entries: expect.objectContaining({
                  type: 'array'
                })
              }),
              required: expect.arrayContaining(['entries'])
            })
          }),
          expect.objectContaining({
            name: 'set_flows',
            description: expect.stringContaining('single flow object or an array'),
            inputSchema: expect.objectContaining({
              properties: expect.objectContaining({
                data: expect.objectContaining({ type: 'string' })
              }),
              required: expect.arrayContaining(['data'])
            })
          })
        ])
      }
    })
  })

  it('calls the Scryer tool bridge through MCP tools/call', async () => {
    const projectPath = await createProject()

    await expect(
      handleScryerMcpMessage(projectPath, {
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: { name: 'get_model', arguments: {} }
      })
    ).resolves.toMatchObject({
      id: 'call-1',
      result: {
        content: [expect.objectContaining({ type: 'text' })],
        isError: false
      }
    })
  })

  it('answers Content-Length framed MCP stdio messages', async () => {
    const projectPath = await createProject()
    const input = new PassThrough()
    const chunks: Buffer[] = []
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        callback()
      }
    })
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    })

    const serverDone = runScryerMcpServer(projectPath, input, output)
    input.end(`Content-Length: ${Buffer.byteLength(request, 'utf8')}\r\n\r\n${request}`)
    await serverDone

    const response = Buffer.concat(chunks).toString('utf8')
    expect(response).toMatch(/^Content-Length: \d+\r\n\r\n/)
    const body = response.slice(response.indexOf('\r\n\r\n') + 4)
    expect(JSON.parse(body)).toMatchObject({
      id: 1,
      result: {
        capabilities: { tools: {} },
        serverInfo: { name: 'orca-scryer' },
        instructions: expect.stringContaining('## C4 Modeling Rules')
      }
    })
  })
})
