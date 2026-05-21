import { resolve } from 'path'
import type { CommandHandler } from '../dispatch'
import { runScryerMcpServer } from '../scryer-mcp-server'

export const SCRYER_MCP_HANDLERS: Record<string, CommandHandler> = {
  'scryer-mcp': async ({ flags, cwd }) => {
    const project = flags.get('project')
    await runScryerMcpServer(resolve(typeof project === 'string' ? project : cwd))
  }
}
