import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { pasteDraftWhenAgentReady } from '@/lib/agent-paste-draft'
import { track, tuiAgentToAgentKind } from '@/lib/telemetry'
import { seedCommandCodeSubmittedPromptStatus } from '@/lib/command-code-prompt-status-seed'
import { translate } from '@/i18n/i18n'
import type { TuiAgent } from '../../../shared/types'

export type ScheduleAgentStartupPasteArgs = {
  tabId: string
  worktreeId: string
  agent: TuiAgent
  /** Draft/prompt text to paste once the agent is ready. */
  content: string
  /** Submit the pasted content after it lands (generated prompts) vs. leave it as a draft. */
  submit: boolean
  forcePaste: boolean
  /** The trimmed prompt used to seed Command Code working status on submit. */
  submittedPrompt: string
  onPromptDelivered?: () => void
}

/**
 * Schedule the bracketed-paste-after-ready follow-up after the agent startup
 * command has been queued.
 *
 * Why: extracted from `launchAgentInNewTab` so that hook keeps its focused
 * launch sequencing (and stays under the module line budget). Fire-and-forget so
 * callers keep their synchronous signature; the helper short-circuits for agents
 * with a `draftPromptFlag`, so it is safe on the followup path even when the
 * draft was already injected via the native flag.
 */
export function scheduleAgentStartupPaste(args: ScheduleAgentStartupPasteArgs): void {
  const { tabId, worktreeId, agent, content, submit, forcePaste, submittedPrompt } = args
  void pasteDraftWhenAgentReady({
    tabId,
    content,
    agent,
    submit,
    forcePaste,
    onTimeout: () => {
      const state = useAppStore.getState()
      const tabsForWorktree = state.tabsByWorktree[worktreeId] ?? []
      const tab = tabsForWorktree.find((t) => t.id === tabId)
      // Why: if the PTY never spawned, QuickLaunch's 5s watchdog already surfaced
      // the launch failure. Don't double-toast for the same root cause. Looking up
      // directly in `worktreeId` (not scanning every worktree) also preserves
      // "still in this worktree" intent.
      if (!tab) {
        return // tab closed by user
      }
      if (tab.ptyId === null) {
        return // launch failed; QuickLaunch handled the user-facing toast
      }
      if (state.activeWorktreeId !== worktreeId) {
        return
      }
      const label = submit ? 'prompt' : 'notes'
      toast.message(
        translate(
          'auto.lib.launch.agent.in.new.tab.a5a1f7033f',
          "Your {{value0}} wasn't sent — paste it once the agent is ready.",
          { value0: label }
        )
      )
      track('agent_error', {
        error_class: 'paste_readiness_timeout',
        agent_kind: tuiAgentToAgentKind(agent)
      })
    }
  }).then((delivered) => {
    if (delivered) {
      if (agent === 'command-code' && submit) {
        // Why: Command Code has no prompt-submit hook; when Orca submits a
        // generated prompt after readiness, seed working at delivery time.
        seedCommandCodeSubmittedPromptStatus(tabId, submittedPrompt)
      }
      args.onPromptDelivered?.()
    }
  })
}
