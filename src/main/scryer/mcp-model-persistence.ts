import type { ScryerToolResult } from '../../shared/scryer/model-types'
import { executeStrictScryerOperation, fail } from './mcp-tool-execution'

export async function setModel(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (typeof args.data !== 'string') {
    return fail('set_model requires a JSON string in arguments.data')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(args.data) as unknown
  } catch (error) {
    return fail(`Invalid model JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  // Why: set_model always writes the strict Scryer 0.3 model through the cataloged
  // Engine operation (committed + planned), never a legacy C4 document on disk.
  return executeStrictScryerOperation(
    projectPath,
    'scryer.model.set',
    { data: parsed },
    'Set model'
  )
}
