import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SCRYER_MCP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['scryer-mcp'],
    summary: 'Run the Orca Scryer MCP server over stdio',
    usage: 'orca scryer-mcp [--project <path>]',
    allowedFlags: [...GLOBAL_FLAGS, 'project'],
    notes: ['Used by generated MCP config files. The process speaks JSON-RPC over stdio.']
  }
]
