import { z } from 'zod'

const requiredString = z.string().refine((value) => value.trim().length > 0)
const authorizationFields = [
  'leaseToken',
  'token',
  'leaseId',
  'activeLeaseId',
  'authorization'
] as const

const beginEditSessionRequestSchema = z
  .object({
    projectPath: requiredString,
    agentRunId: requiredString
  })
  .strict()

const completeEditSessionRequestSchema = z
  .object({
    projectPath: requiredString,
    agentRunId: requiredString,
    foldPolicy: z.enum(['never', 'when_gate_passes']).optional()
  })
  .strict()

const cancelEditSessionRequestSchema = z
  .object({
    projectPath: requiredString,
    agentRunId: requiredString
  })
  .strict()

const readEditSessionRequestSchema = z.object({ projectPath: requiredString }).strict()

const executeScryerOperationRequestSchema = z
  .object({
    projectPath: requiredString,
    operationId: requiredString,
    input: z.unknown().optional(),
    requestId: requiredString.optional()
  })
  .strict()

export type ArchitectureBeginEditSessionRequest = z.infer<typeof beginEditSessionRequestSchema>
export type ArchitectureCompleteEditSessionRequest = z.infer<
  typeof completeEditSessionRequestSchema
>
export type ArchitectureCancelEditSessionRequest = z.infer<typeof cancelEditSessionRequestSchema>
export type ArchitectureReadEditSessionRequest = z.infer<typeof readEditSessionRequestSchema>
export type ArchitectureExecuteScryerOperationRequest = z.infer<
  typeof executeScryerOperationRequestSchema
>

function requestRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null
}

function describeRequestError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) {
    return 'invalid request object'
  }
  if (issue.code === 'unrecognized_keys') {
    const fields = issue.keys.map((key) => `'${key}'`).join(', ')
    return issue.keys.length === 1 ? `unknown field ${fields}` : `unknown fields ${fields}`
  }
  const path = issue.path.map(String).join('.')
  return path ? `invalid request field '${path}'` : 'invalid request object'
}

function parseArchitectureRequest<Schema extends z.ZodType>(
  channel: string,
  schema: Schema,
  input: unknown
): z.output<Schema> {
  const record = requestRecord(input)
  if (record) {
    for (const field of authorizationFields) {
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        // Why: renderer requests never own lease authority; report only the field name.
        throw new Error(`${channel} rejected forbidden authorization field '${field}'`)
      }
    }
  }
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new Error(`${channel} rejected ${describeRequestError(parsed.error)}`)
  }
  return parsed.data
}

export function parseArchitectureBeginEditSessionRequest(
  input: unknown
): ArchitectureBeginEditSessionRequest {
  return parseArchitectureRequest(
    'architecture:beginEditSession',
    beginEditSessionRequestSchema,
    input
  )
}

export function parseArchitectureCompleteEditSessionRequest(
  input: unknown
): ArchitectureCompleteEditSessionRequest {
  return parseArchitectureRequest(
    'architecture:completeEditSession',
    completeEditSessionRequestSchema,
    input
  )
}

export function parseArchitectureCancelEditSessionRequest(
  input: unknown
): ArchitectureCancelEditSessionRequest {
  return parseArchitectureRequest(
    'architecture:cancelEditSession',
    cancelEditSessionRequestSchema,
    input
  )
}

export function parseArchitectureReadEditSessionRequest(
  input: unknown
): ArchitectureReadEditSessionRequest {
  return parseArchitectureRequest(
    'architecture:readEditSession',
    readEditSessionRequestSchema,
    input
  )
}

export function parseArchitectureExecuteScryerOperationRequest(
  input: unknown
): ArchitectureExecuteScryerOperationRequest {
  return parseArchitectureRequest(
    'architecture:executeScryerOperation',
    executeScryerOperationRequestSchema,
    input
  )
}
