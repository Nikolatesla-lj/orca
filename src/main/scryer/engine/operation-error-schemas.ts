import { z } from 'zod'
import type { ScryerOperationErrorCode, ScryerValidationFindingCode } from './operation-identifiers'

export const fieldErrorSchema = z
  .object({
    path: z.string(),
    message: z.string(),
    code: z.string().optional()
  })
  .strict()

export const validationFindingCodeSchema = z.enum([
  'destructive_change',
  'duplicate_id',
  'missing_reference',
  'invalid_hierarchy',
  'invalid_external',
  'empty_responsibility',
  'description_too_long',
  'invalid_symbol_name',
  'empty_symbol',
  'illegal_link',
  'invalid_group',
  'unknown_source_map_target',
  'unknown_boundary_target',
  'disconnected_node',
  'coverage_gap',
  'coverage_overlap',
  'anchor_range_warning',
  'invalid_drift_marker_transition',
  'no_op'
] satisfies ScryerValidationFindingCode[])

export const validationFindingSchema = z
  .object({
    code: validationFindingCodeSchema,
    severity: z.union([z.literal('info'), z.literal('warning'), z.literal('error')]),
    message: z.string(),
    path: z.string().optional(),
    jsonPointer: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional()
  })
  .strict()

export const operationWarningSchema = z
  .object({
    code: z.literal('maintenance_write_failed'),
    message: z.string(),
    target: z
      .union([
        z.literal('sync'),
        z.literal('anchor_baseline'),
        z.literal('committed_source_map_reanchor'),
        z.literal('history'),
        z.literal('baseline')
      ])
      .optional(),
    details: z.record(z.string(), z.unknown()).optional()
  })
  .strict()

export const invalidContextDetailsSchema = z
  .object({
    reason: z.union([
      z.literal('missing_workspace_root'),
      z.literal('project_outside_workspace'),
      z.literal('unsupported_transport'),
      z.literal('missing_agent_run_id')
    ]),
    field: z.string().optional()
  })
  .strict()

export const incompatibleModelDetailsSchema = z
  .object({
    path: z.string(),
    expectedVersion: z.literal('0.3'),
    actualVersion: z.string().optional(),
    fields: z.array(z.string()).optional(),
    reason: z.union([
      z.literal('missing_version'),
      z.literal('unsupported_version'),
      z.literal('invalid_json'),
      z.literal('unknown_fields'),
      z.literal('invalid_schema')
    ])
  })
  .strict()

const ioTargetSchema = z.union([
  z.literal('model'),
  z.literal('planned'),
  z.literal('history'),
  z.literal('baseline'),
  z.literal('sync'),
  z.literal('anchor_baseline'),
  z.literal('build_edges'),
  z.literal('rules'),
  z.literal('project_tree'),
  z.literal('lock')
])

export const ioErrorDetailsSchema = z
  .object({
    target: ioTargetSchema,
    operation: z.union([
      z.literal('read'),
      z.literal('write'),
      z.literal('rename'),
      z.literal('mkdir'),
      z.literal('append'),
      z.literal('lock')
    ]),
    path: z.string().optional(),
    cause: z.string().optional()
  })
  .strict()

const leaseAuthorizationDetailsSchema = z
  .object({
    policy: z.union([z.literal('write_if_active'), z.literal('completion_gate')]),
    reason: z.union([
      z.literal('missing_authorization'),
      z.literal('authorization_mismatch'),
      z.literal('run_mismatch')
    ]),
    owner: z.union([z.literal('agent'), z.literal('human'), z.literal('system')]).optional()
  })
  .strict()

export const errorDetailSchemas = {
  invalid_input: z.undefined(),
  invalid_context: invalidContextDetailsSchema,
  incompatible_model: incompatibleModelDetailsSchema,
  io_error: ioErrorDetailsSchema,
  lock_busy: z
    .object({
      lockPath: z.string().optional(),
      owner: z.string().optional(),
      retryAfterMs: z.number().optional()
    })
    .strict(),
  lease_required: leaseAuthorizationDetailsSchema,
  operation_not_found: z
    .object({
      operationId: z.string()
    })
    .strict(),
  internal_error: z
    .object({
      reason: z.union([
        z.literal('success_schema_failed'),
        z.literal('error_details_schema_failed'),
        z.literal('undeclared_error_code'),
        z.literal('policy_violation'),
        z.literal('malformed_warning'),
        z.literal('unknown_warning_code'),
        z.literal('invalid_final_snapshot'),
        z.literal('unexpected_exception')
      ]),
      contractOperationId: z.string().optional()
    })
    .strict(),
  not_found: z
    .object({
      entity: z.union([
        z.literal('project'),
        z.literal('node'),
        z.literal('link'),
        z.literal('group'),
        z.literal('responsibility'),
        z.literal('property'),
        z.literal('source_entry'),
        z.literal('boundary'),
        z.literal('rule_topic'),
        z.literal('agent_run')
      ]),
      id: z.string(),
      field: z.string().optional()
    })
    .strict(),
  illegal_link: z
    .object({
      reason: z.union([
        z.literal('self_link'),
        z.literal('ancestor_descendant'),
        z.literal('same_level_reference'),
        z.literal('duplicate_link')
      ]),
      src: z.string(),
      dst: z.string(),
      linkId: z.string().optional()
    })
    .strict(),
  validation_failed: z
    .object({
      findings: z.array(validationFindingSchema)
    })
    .strict(),
  agent_run_required: leaseAuthorizationDetailsSchema
} satisfies Record<ScryerOperationErrorCode, z.ZodTypeAny>
