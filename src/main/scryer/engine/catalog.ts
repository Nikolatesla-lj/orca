import { AUTHORING_CATALOG_ROWS } from './catalog-authoring-rows'
import { GENERATION_DRIFT_CATALOG_ROWS } from './catalog-generation-drift-rows'
import { ALL_SCRYER_OPERATION_IDS } from './catalog-operation-ids'
import { metadataFor, type ScryerCatalogRow } from './catalog-policy'
import { READ_CATALOG_ROWS } from './catalog-read-rows'
import { STRUCTURAL_CATALOG_ROWS } from './catalog-structural-rows'
import { createScryerOperationCatalog } from './catalog-validation'
import { errorDetailSchemas } from './operation-error-schemas'
import { operationSchemas } from './operation-schemas'
import { failure } from './operations/operation-result'
import type {
  ScryerOperationCatalog,
  ScryerOperationContract,
  ScryerOperationExecutor,
  ScryerOperationId
} from './types'

export { ALL_SCRYER_OPERATION_IDS, createScryerOperationCatalog }

const CATALOG_ROWS: ScryerCatalogRow[] = [
  ...READ_CATALOG_ROWS,
  ...STRUCTURAL_CATALOG_ROWS,
  ...AUTHORING_CATALOG_ROWS,
  ...GENERATION_DRIFT_CATALOG_ROWS
]

function unimplemented(operationId: ScryerOperationId): ScryerOperationExecutor<unknown, unknown> {
  return () =>
    failure('internal_error', `${operationId} is registered but not implemented in this slice`, {
      reason: 'unexpected_exception',
      contractOperationId: operationId
    })
}

export function createDefaultScryerOperationCatalog(): ScryerOperationCatalog {
  const catalog = createScryerOperationCatalog()
  for (const row of CATALOG_ROWS) {
    const schemas = operationSchemas[row.id]
    const contract: ScryerOperationContract<unknown, unknown> = {
      id: row.id,
      capability: row.capability,
      risk: row.risk,
      ...(row.operationClass ? { operationClass: row.operationClass } : {}),
      ...(row.writeScope ? { writeScope: row.writeScope } : {}),
      inputSchema: schemas.input,
      successSchema: schemas.success,
      errors: Object.fromEntries(
        (row.errors ?? []).map((code) => [code, errorDetailSchemas[code]])
      ),
      policy: row.policy,
      upstream: row.upstream,
      transports: metadataFor(row.id, row.policy),
      execute: row.execute ?? unimplemented(row.id)
    }
    catalog.registerOperation(contract)
  }
  return catalog
}
