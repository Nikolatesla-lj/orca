import type { WebContents } from 'electron'
import type { Store } from '../persistence'
import type {
  Automation,
  AutomationDispatchRequest,
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun,
  AutomationRunStatus
} from '../../shared/automations-types'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import type { PipelineService } from '../pipelines/service'
import { splitWorktreeIdForFilesystem } from '../../shared/worktree-id'
import { runAutomationPrecheck } from './precheck-runner'
import { collectAutomationRunUsage } from './usage-collector'

const DEFAULT_TICK_MS = 60 * 1000
type PipelineRunner = Pick<PipelineService, 'run'>

export class AutomationService {
  private readonly store: Store
  private readonly tickMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private webContents: WebContents | null = null
  private rendererReady = false
  private evaluating = false
  private readonly claudeUsage: ClaudeUsageStore | null
  private readonly codexUsage: CodexUsageStore | null
  private readonly pipelineService: PipelineRunner | null

  constructor(
    store: Store,
    opts: {
      tickMs?: number
      claudeUsage?: ClaudeUsageStore
      codexUsage?: CodexUsageStore
      pipelineService?: PipelineRunner
    } = {}
  ) {
    this.store = store
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS
    this.claudeUsage = opts.claudeUsage ?? null
    this.codexUsage = opts.codexUsage ?? null
    this.pipelineService = opts.pipelineService ?? null
  }

  setWebContents(webContents: WebContents | null): void {
    this.webContents = webContents
    this.rendererReady = false
  }

  setRendererReady(): void {
    this.rendererReady = true
    void this.evaluateDueRuns()
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => {
      void this.evaluateDueRuns()
    }, this.tickMs)
    if (this.rendererReady) {
      void this.evaluateDueRuns()
    }
  }

  stop(): void {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  async runNow(automationId: string): Promise<AutomationRun> {
    const automation = this.store.listAutomations().find((entry) => entry.id === automationId)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    const run = this.store.createAutomationRun(automation, Date.now(), 'manual')
    return await this.requestDispatch(automation, run)
  }

  async runPrecheck(automationId: string, runId: string): Promise<AutomationPrecheckResult | null> {
    const automation = this.store.listAutomations().find((entry) => entry.id === automationId)
    if (!automation) {
      throw new Error('Automation not found.')
    }
    const run = this.store.listAutomationRuns(automationId).find((entry) => entry.id === runId)
    if (!run) {
      throw new Error('Automation run not found.')
    }
    if (run.trigger !== 'scheduled' || !automation.precheck) {
      return null
    }
    const cwd = this.getPrecheckCwd(automation)
    if (!cwd) {
      return {
        command: automation.precheck.command,
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
        error: 'Automation precheck target is no longer available.',
        startedAt: Date.now(),
        completedAt: Date.now()
      }
    }
    return await runAutomationPrecheck({
      precheck: automation.precheck,
      target:
        automation.executionTargetType === 'ssh'
          ? { type: 'ssh', cwd, connectionId: automation.executionTargetId }
          : { type: 'local', cwd }
    })
  }

  async markDispatchResult(result: AutomationDispatchResult): Promise<AutomationRun> {
    const run = this.store.updateAutomationRun(result)
    if (!isFinalRunStatus(run.status)) {
      return run
    }
    // Why: the renderer's mark-completed effect can re-fire for the same run
    // before refresh() flips its status snapshot off 'dispatched'. Re-running
    // collectRunUsage advances the attribution window and can rewrite an
    // already-collected 'known' usage to 'unavailable'/'ambiguous_session'.
    if (run.usage) {
      return run
    }
    const automation = this.store.listAutomations().find((entry) => entry.id === run.automationId)
    const usage = await collectAutomationRunUsage({
      automation,
      run,
      claudeUsage: this.claudeUsage,
      codexUsage: this.codexUsage
    })
    return this.store.updateAutomationRun({
      runId: run.id,
      status: run.status,
      workspaceId: run.workspaceId,
      terminalSessionId: run.terminalSessionId,
      usage,
      error: run.error
    })
  }

  private async evaluateDueRuns(): Promise<void> {
    if (this.evaluating) {
      return
    }
    this.evaluating = true
    try {
      const now = Date.now()
      for (const automation of this.store.listAutomations()) {
        if (!automation.enabled || automation.nextRunAt > now) {
          continue
        }
        await this.evaluateAutomation(automation, now)
      }
    } finally {
      this.evaluating = false
    }
  }

  private getPrecheckCwd(automation: Automation): string | null {
    if (automation.workspaceMode === 'existing') {
      const parsed = automation.workspaceId
        ? splitWorktreeIdForFilesystem(automation.workspaceId)
        : null
      return parsed?.worktreePath ?? null
    }
    return this.store.getRepo(automation.projectId)?.path ?? null
  }

  private async evaluateAutomation(automation: Automation, now: number): Promise<void> {
    const scheduledFor = this.store.getLatestAutomationOccurrence(automation, now)
    if (scheduledFor === null) {
      this.store.advanceAutomationNextRun(automation.id, now)
      return
    }
    const run = this.store.createAutomationRun(automation, scheduledFor)
    const graceMs = automation.missedRunGraceMinutes * 60 * 1000
    if (now - scheduledFor > graceMs) {
      this.store.updateAutomationRun({
        runId: run.id,
        status: 'skipped_missed',
        workspaceId: automation.workspaceId,
        error: 'Orca was unavailable during the missed-run grace window.'
      })
      this.store.advanceAutomationNextRun(automation.id, now)
      return
    }

    await this.requestDispatch(automation, run)
    this.store.advanceAutomationNextRun(automation.id, now)
  }

  private async requestDispatch(
    automation: Automation,
    run: AutomationRun
  ): Promise<AutomationRun> {
    if (automation.target.type === 'pipeline') {
      if (!this.pipelineService) {
        return this.store.updateAutomationRun({
          runId: run.id,
          status: 'dispatch_failed',
          workspaceId: null,
          error: 'Pipeline service is unavailable.'
        })
      }
      try {
        const result = this.pipelineService.run(automation.target.pipelineInput, {
          automationRunId: run.id
        })
        return this.store.updateAutomationRun({
          runId: run.id,
          status: 'dispatched',
          workspaceId: null,
          pipelineRunId: result.run.id,
          error: null
        })
      } catch (err) {
        return this.store.updateAutomationRun({
          runId: run.id,
          status: 'dispatch_failed',
          workspaceId: null,
          error: err instanceof Error ? err.message : 'Pipeline run dispatch failed.'
        })
      }
    }
    const webContents = this.webContents
    if (!webContents || webContents.isDestroyed() || !this.rendererReady) {
      return this.store.updateAutomationRun({
        runId: run.id,
        status: 'skipped_unavailable',
        workspaceId: automation.workspaceId,
        error: 'No Orca window was available to launch the automation.'
      })
    }
    const updated = this.store.updateAutomationRun({
      runId: run.id,
      status: 'dispatching',
      workspaceId: automation.workspaceId,
      error: null
    })
    const payload: AutomationDispatchRequest = { automation, run: updated }
    webContents.send('automations:dispatchRequested', payload)
    return updated
  }
}

function isFinalRunStatus(status: AutomationRunStatus): boolean {
  return (
    status === 'completed' ||
    status === 'dispatch_failed' ||
    status === 'skipped_precheck' ||
    status === 'skipped_missed' ||
    status === 'skipped_unavailable' ||
    status === 'skipped_needs_interactive_auth'
  )
}
