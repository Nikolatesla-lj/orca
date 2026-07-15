import { ALL_SCRYER_OPERATION_IDS } from './catalog-operation-ids'
import { flatPolicies, metadataKeys, sideEffectRequirements } from './catalog-policy'
import { errorDetailSchemas } from './operation-error-schemas'
import type {
  ScryerCatalogValidationError,
  ScryerCatalogValidationResult,
  ScryerOperationCatalog,
  ScryerOperationContract,
  ScryerOperationErrorCode
} from './types'

export function createScryerOperationCatalog(): ScryerOperationCatalog {
  const contracts: ScryerOperationContract<unknown, unknown>[] = []
  return {
    registerOperation(contract) {
      contracts.push(contract as ScryerOperationContract<unknown, unknown>)
    },
    getOperationContract(operationId) {
      return contracts.find((contract) => contract.id === operationId)
    },
    listOperationContracts() {
      return [...contracts]
    },
    validateCatalog(options = {}) {
      const errors: ScryerCatalogValidationError[] = []
      const seen = new Set<string>()
      for (const contract of contracts) {
        if (seen.has(contract.id)) {
          errors.push({
            operationId: contract.id,
            code: 'duplicate_operation_id',
            message: `Duplicate Scryer operation id ${contract.id}`
          })
        }
        seen.add(contract.id)
        if (!contract.inputSchema || !contract.successSchema) {
          errors.push({
            operationId: contract.id,
            code: 'missing_schema',
            message: `${contract.id} must declare input and success schemas`
          })
        }
        for (const [code, schema] of Object.entries(contract.errors)) {
          if (!schema || !errorDetailSchemas[code as ScryerOperationErrorCode]) {
            errors.push({
              operationId: contract.id,
              code: 'missing_error_schema',
              message: `${contract.id} declares ${code} without a detail schema`
            })
          }
        }
        if (contract.upstream.length === 0) {
          errors.push({
            operationId: contract.id,
            code: 'missing_upstream_anchor',
            message: `${contract.id} must reference upstream behavior anchors`
          })
        }
        if ('branches' in contract.policy) {
          const values = contract.policy.discriminator.allowedValues
          const branches = contract.policy.branches.map((branch) => branch.when.equals)
          for (const value of values) {
            if (branches.filter((branch) => branch === value).length !== 1) {
              errors.push({
                operationId: contract.id,
                code: 'invalid_policy_branch',
                message: `${contract.id} must have exactly one branch for ${value}`
              })
            }
          }
        }
        for (const policy of flatPolicies(contract.policy)) {
          for (const effect of policy.sideEffects) {
            const requirement = sideEffectRequirements(effect)
            if (
              requirement.maintenance &&
              !policy.maintenanceWrites.some((item) => item.target === requirement.maintenance)
            ) {
              errors.push({
                operationId: contract.id,
                code: 'invalid_policy',
                message: `${contract.id} side effect ${effect} requires ${requirement.maintenance}`
              })
            }
            if (requirement.read && !policy.reads.includes(requirement.read)) {
              errors.push({
                operationId: contract.id,
                code: 'invalid_policy',
                message: `${contract.id} side effect ${effect} requires read ${requirement.read}`
              })
            }
            if (
              requirement.lease &&
              policy.lease !== requirement.lease &&
              contract.capability !== 'plan_fold'
            ) {
              errors.push({
                operationId: contract.id,
                code: 'invalid_policy',
                message: `${contract.id} side effect ${effect} requires ${requirement.lease}`
              })
            }
          }
          if (
            contract.risk === 'high' &&
            (policy.semanticWrites.length > 0 ||
              policy.maintenanceWrites.some((item) => item.mode === 'required')) &&
            policy.lock !== 'exclusive'
          ) {
            errors.push({
              operationId: contract.id,
              code: 'invalid_policy',
              message: `${contract.id} high-risk writes require an exclusive lock`
            })
          }
          for (const key of metadataKeys(contract.transports)) {
            if (!policy.authorization.transports.includes(key)) {
              errors.push({
                operationId: contract.id,
                code: 'invalid_transport_metadata',
                message: `${contract.id} metadata exposes ${key} outside authorization policy`
              })
            }
          }
        }
        if (!options.allowTestTransport && contract.transports.test) {
          errors.push({
            operationId: contract.id,
            code: 'test_transport_not_allowed',
            message: `${contract.id} exposes test transport in a production catalog`
          })
        }
      }
      for (const operationId of ALL_SCRYER_OPERATION_IDS) {
        if (!seen.has(operationId)) {
          errors.push({
            operationId,
            code: 'missing_schema',
            message: `${operationId} is missing from the catalog`
          })
        }
      }
      return { ok: errors.length === 0, errors } satisfies ScryerCatalogValidationResult
    }
  }
}
