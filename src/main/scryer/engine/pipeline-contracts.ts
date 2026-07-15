import type { CreateScryerEngineOptions, ScryerErrorMapper, ScryerOperationCatalog } from './types'
import type { ScryerStateStore } from './state-store'

export type PipelineOptions = {
  catalog: ScryerOperationCatalog
  store: ScryerStateStore
  errorMapper: ScryerErrorMapper
  clock: NonNullable<CreateScryerEngineOptions['clock']>
  requestIds: NonNullable<CreateScryerEngineOptions['requestIds']>
  allowTestTransport: boolean
}
