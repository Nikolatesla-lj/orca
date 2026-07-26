import type { ScryModel } from './model'
import type { ScryerCaller, ScryerTransport } from './operation-identifiers'

export type ScryerOperationContext = {
  requestId?: string
  transport: ScryerTransport
  caller: ScryerCaller
  cwd: string
  projectRoot?: string
  workspaceRoot?: string
  sessionId?: string
  agentRunId?: string
  leaseToken?: string
  output?: {
    json?: boolean
    verbose?: boolean
  }
}

export type ScryerTrustedAgentIdentity = {
  agentRunId?: string
  paneKey?: string
  connectionId?: string | null
}

export type ResolvedScryerProject = {
  projectRoot: string
}

export type ScryerProjectRef = ResolvedScryerProject

export type ModelEditLease = {
  token: string
  owner?: 'agent' | 'human' | 'system'
  agentRunId?: string
  paneKey?: string
  connectionId?: string | null
  sessionStartedAt?: number
  createdAt?: string
  expiresAt?: string
}

export type ScryerSyncState = {
  reconciledAt?: string
  commit?: string
}

export type ScryerHistoryEvent = Record<string, unknown>

export type ScryerStateChanges = {
  planned?: ScryModel
  committed?: ScryModel
  historyEvents?: ScryerHistoryEvent[]
  syncState?: ScryerSyncState
  baseline?: 'refresh' | 'none'
  anchorBaseline?: 'refresh' | 'none'
  committedSourceMapReanchor?: 'refresh' | 'none'
}

export type ScryerLoadedState = {
  committed?: ScryModel
  planned?: ScryModel
}

export type ScryerClock = {
  nowIso(): string
}

export type ScryerRequestIdFactory = {
  next(): string
}
