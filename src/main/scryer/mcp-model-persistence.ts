import type { C4ModelData, ScryerToolResult } from '../../shared/scryer/model-types'
import { parseModelData } from '../../shared/scryer/parse-model'
import { writeBaseline, writeModel } from './model-store'
import { executeStrictScryerOperation, fail, isStrictScryerModel, ok } from './mcp-tool-execution'
import { stripPositions } from './mcp-task-model'
import { validateModelShape } from './mcp-model-validation'

export async function writeModelAndBaseline(
  projectPath: string,
  model: C4ModelData
): Promise<void> {
  await writeModel(projectPath, model)
  await writeBaseline(projectPath, model)
}

export async function setModel(
  projectPath: string,
  args: Record<string, unknown>
): Promise<ScryerToolResult> {
  if (typeof args.data !== 'string') {
    return fail('set_model requires a JSON string in arguments.data')
  }
  if (await isStrictScryerModel(projectPath)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(args.data) as unknown
    } catch (error) {
      return fail(`Invalid model JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    return executeStrictScryerOperation(
      projectPath,
      'scryer.model.set',
      { data: parsed },
      'Set model'
    )
  }
  let model: C4ModelData
  try {
    model = stripPositions(parseModelData(args.data))
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  const errors = validateModelShape(model)
  if (errors.length > 0) {
    return fail(errors.join('\n'))
  }
  await writeModelAndBaseline(projectPath, model)
  return ok(`Set model (${model.nodes.length} nodes, ${model.edges.length} edges)`, model)
}
