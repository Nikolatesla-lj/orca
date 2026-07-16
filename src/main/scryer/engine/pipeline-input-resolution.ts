import { isAbsolute, relative, resolve } from 'node:path'
import type {
  ResolvedScryerProject,
  ScryerExecutorFailure,
  ScryerFieldError,
  ScryerFlatOperationPolicy,
  ScryerOperationContext,
  ScryerOperationPolicy
} from './types'
import type { PipelineOptions } from './pipeline-contracts'
import type { ScryerStateStore } from './state-store'

export function fieldErrorsFromZod(error: unknown): ScryerFieldError[] {
  const issues =
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues)
      ? (error as { issues: { path?: unknown[]; message?: string; code?: string }[] }).issues
      : []
  if (issues.length === 0) {
    return [{ path: 'input', message: 'Invalid input' }]
  }
  return issues.map((issue) => ({
    path: (issue.path ?? []).map(String).join('.') || 'input',
    message: issue.message ?? 'Invalid input',
    ...(issue.code ? { code: issue.code } : {})
  }))
}
export function validateContext(
  context: ScryerOperationContext,
  requestId: string
): ScryerExecutorFailure | null {
  if (!context.cwd) {
    return {
      code: 'invalid_context',
      message: 'Scryer operation context requires cwd',
      details: { reason: 'missing_workspace_root', field: 'cwd' }
    }
  }
  if (!context.transport) {
    return {
      code: 'invalid_context',
      message: 'Scryer operation context requires transport',
      details: { reason: 'unsupported_transport', field: 'transport' }
    }
  }
  if (!requestId) {
    return {
      code: 'invalid_context',
      message: 'Scryer operation context requires request id',
      details: { reason: 'missing_workspace_root', field: 'requestId' }
    }
  }
  return null
}

export function resolvePolicy(
  policy: ScryerOperationPolicy,
  input: Record<string, unknown>
): ScryerFlatOperationPolicy | ScryerExecutorFailure {
  if (!('branches' in policy)) {
    return policy
  }
  const value = input[policy.discriminator.inputField]
  if (typeof value !== 'string') {
    return {
      code: 'invalid_input',
      message: `Missing policy discriminator '${policy.discriminator.inputField}'`,
      fieldErrors: [
        {
          path: policy.discriminator.inputField,
          message: 'Required policy discriminator'
        }
      ]
    }
  }
  const branch = policy.branches.find((candidate) => candidate.when.equals === value)
  if (!branch) {
    return {
      code: 'invalid_input',
      message: `Unsupported policy discriminator value '${value}'`,
      fieldErrors: [
        {
          path: policy.discriminator.inputField,
          message: `Expected one of ${policy.discriminator.allowedValues.join(', ')}`
        }
      ]
    }
  }
  return branch.policy
}

export function resolveProject(
  input: Record<string, unknown>,
  context: ScryerOperationContext,
  policy: ScryerFlatOperationPolicy
): ResolvedScryerProject | ScryerExecutorFailure {
  const rawProject =
    typeof input.project === 'string' && policy.authorization.project.allowProjectOverride
      ? input.project
      : (context.projectRoot ?? context.cwd)
  const projectRoot = resolve(rawProject)
  if (policy.authorization.project.containment === 'workspace_required' && context.workspaceRoot) {
    const workspaceRoot = resolve(context.workspaceRoot)
    const rel = relative(workspaceRoot, projectRoot)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return {
        code: 'invalid_context',
        message: 'Scryer project is outside the trusted workspace root',
        details: { reason: 'project_outside_workspace', field: 'project' }
      }
    }
  }
  return { projectRoot }
}

export function transportFailure(
  context: ScryerOperationContext,
  policy: ScryerFlatOperationPolicy
): ScryerExecutorFailure | null {
  if (!policy.authorization.transports.includes(context.transport)) {
    return {
      code: 'invalid_context',
      message: `Transport '${context.transport}' cannot invoke this Scryer operation`,
      details: { reason: 'unsupported_transport', field: 'transport' }
    }
  }
  return null
}

export async function leaseFailure(
  store: ScryerStateStore,
  project: ResolvedScryerProject,
  policy: ScryerFlatOperationPolicy,
  context: ScryerOperationContext,
  input: Record<string, unknown>,
  options: Pick<PipelineOptions, 'trustedRuntimeIdentity'>
): Promise<ScryerExecutorFailure | null> {
  const trustedIdentity =
    context.transport === 'agent' && context.caller === 'agent'
      ? options.trustedRuntimeIdentity.read()
      : null
  const effectiveAgentRunId = context.agentRunId ?? trustedIdentity?.agentRunId
  if (policy.authorization.agentRun.required && !effectiveAgentRunId) {
    return {
      code: 'agent_run_required',
      message: 'Trusted Orca agent-run context is required',
      details: { policy: 'completion_gate', reason: 'missing_authorization' }
    }
  }
  if (policy.lease === 'none') {
    return null
  }
  const lease = await store.readActiveLease(project.projectRoot)
  if (!lease) {
    return policy.lease === 'completion_gate'
      ? {
          code: 'lease_required',
          message: 'Completion-gated Scryer fold requires an active matching lease',
          details: { policy: 'completion_gate', reason: 'missing_authorization' }
        }
      : null
  }
  const tokenMatches = Boolean(context.leaseToken && context.leaseToken === lease.token)
  const trustedIdentityMatches = Boolean(
    trustedIdentity?.agentRunId &&
    lease.agentRunId === trustedIdentity.agentRunId &&
    (!lease.paneKey || trustedIdentity.paneKey === lease.paneKey)
  )
  if (!tokenMatches && !trustedIdentityMatches) {
    const reason =
      context.leaseToken || trustedIdentity?.agentRunId
        ? 'authorization_mismatch'
        : 'missing_authorization'
    return {
      code: policy.lease === 'completion_gate' ? 'agent_run_required' : 'lease_required',
      message: 'A Scryer model edit lease is active; trusted authorization is required.',
      details: {
        policy: policy.lease,
        reason,
        ...(lease.owner ? { owner: lease.owner } : {})
      },
      retryable: true
    }
  }
  if (
    policy.lease === 'completion_gate' &&
    typeof input.mode === 'string' &&
    input.mode === 'agent_completion' &&
    lease.agentRunId &&
    effectiveAgentRunId !== lease.agentRunId
  ) {
    return {
      code: 'agent_run_required',
      message: 'Completion-gated fold lease is bound to a different agent run',
      details: {
        policy: 'completion_gate',
        reason: 'run_mismatch',
        ...(lease.owner ? { owner: lease.owner } : {})
      },
      retryable: false
    }
  }
  return null
}
