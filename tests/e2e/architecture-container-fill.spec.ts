/**
 * Release-critical E2E for the visible "Fill with AI" Container Generation product
 * path (#73). Exercises the lifecycle through the real product entry: click Fill on an
 * empty container -> the fill run acquires the edit-session lease BEFORE any subtree
 * write -> the agent's single container generation atomically writes the subtree via the
 * real Engine -> the token-free Completion Gate governs the terminal state.
 *
 * Assertions anchor on Engine-owned file effects (.scryer/model.scry and planned.scry)
 * and durable visible view state (the generated subtree in the tree), never on a store
 * round-trip alone. The agent write is driven through the real Engine module under the
 * trusted runtime identity (transport 'agent' + ORCA_TAB_ID matched to the agent-owned
 * lease on disk) — exactly how the product's agent path is authorized, with NO lease
 * token passed as an argument — so the file effects are genuine, not simulated.
 *
 * SUCCESS-TERMINAL NOTE: the visible SUCCESS terminal is gated on the main-side
 * Completion Gate, which the edit-session controller fires only when its native
 * agent-run runtime observes the run as `done` — a signal fed exclusively by the
 * agent-hook server over agent Stop-hook HTTP callbacks. The success-terminal test
 * drives that signal through the production protocol itself: the launched agent pane
 * runs a stub whose ONLY job is to emit the same authenticated Stop-hook POST the
 * managed claude hook script sends, using the hook coordinates and pane identity that
 * main injected into the pane env at spawn. Everything past the agent binary — HTTP
 * transport, token auth, payload normalization, status ingest, native runtime,
 * Completion Gate, lease release, and the visible terminal — is production code.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const REPO_ROOT = path.resolve(__dirname, '..', '..')
// The container Engine, compiled per-file (not bundled) by the CLI tsconfig into a
// dedicated dir the electron-vite E2E build never overwrites; the agent's atomic
// generation is driven through this real Engine module below.
const ENGINE_OUT_DIR = path.join(REPO_ROOT, 'out', 'e2e-engine')
const ENGINE_ENTRY = path.join(ENGINE_OUT_DIR, 'main', 'scryer', 'engine', 'index.js')
const RUNNER_PATH = path.join(os.tmpdir(), 'orca-e2e-container-fill-runner.cjs')

// Why: the real agent's `orca scryer container fill` is authorized by the trusted
// runtime identity — transport 'agent' + caller 'agent', with the agent-run id read from
// the ORCA_TAB_ID the terminal exports — matched against the agent-owned edit lease on
// disk. This runner reproduces exactly that authorized write against the real Engine (no
// lease token ever passed as an argument), so the file effects are genuine, not faked.
const RUNNER_SOURCE = `
const { createScryerEngine } = require(${JSON.stringify(ENGINE_ENTRY)})
async function main() {
  const project = process.env.FILL_PROJECT
  const agentRunId = process.env.ORCA_TAB_ID
  const proposal = JSON.parse(process.env.FILL_PROPOSAL)
  const result = await createScryerEngine().executeOperation('scryer.container.fill', proposal, {
    requestId: 'e2e-container-fill',
    transport: 'agent',
    caller: 'agent',
    cwd: project,
    projectRoot: project,
    agentRunId
  })
  if (!result.ok) {
    process.stderr.write(String(result.error.code) + ': ' + String(result.error.message))
    process.exit(1)
  }
}
main().catch((error) => {
  process.stderr.write(error && error.message ? error.message : String(error))
  process.exit(1)
})
`

type SeedNode = {
  id: string
  kind: string
  name: string
  description?: string
  parentId?: string
}

// Drives the agent's single atomic container generation through the real Engine, under
// the trusted runtime identity of the acquired agent lease (ORCA_TAB_ID). No lease token
// is passed as an argument — authorization is resolved from the agent-run identity, the
// same way the product's agent path works.
function runContainerFill(args: {
  worktreePath: string
  agentTabId: string
  proposal: Record<string, unknown>
}): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [RUNNER_PATH], {
      cwd: args.worktreePath,
      env: {
        ...process.env,
        ORCA_TAB_ID: args.agentTabId,
        FILL_PROJECT: args.worktreePath,
        FILL_PROPOSAL: JSON.stringify(args.proposal)
      },
      encoding: 'utf8'
    })
    return { status: 0, stderr: '' }
  } catch (error) {
    const err = error as { status?: number; stderr?: string | Buffer }
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stderr: err.stderr ? err.stderr.toString() : ''
    }
  }
}

async function getActiveWorktreePath(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === state.activeWorktreeId)
    if (!worktree) {
      throw new Error('active worktree not found')
    }
    return worktree.path
  })
}

async function openArchitectureTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New tab' }).click({ force: true })
  const newArchitectureItem = page.getByRole('menuitem', { name: /New Architecture/i }).first()
  await expect(newArchitectureItem).toBeVisible({ timeout: 10_000 })
  await newArchitectureItem.click({ force: true })
  await expect(page.getByTestId('architecture-panel')).toBeVisible({ timeout: 30_000 })
}

async function closeOpenMenus(page: Page): Promise<void> {
  const visibleMenus = page.locator('[role="menu"]:visible')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await visibleMenus.count()) === 0) {
      return
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
  }
}

// Launching Fill opens a foreground agent terminal tab; the architecture panel must be
// re-activated before its visible run state can be asserted.
async function activateArchitectureTab(page: Page): Promise<void> {
  await closeOpenMenus(page)
  await page
    .getByRole('button', { name: /Architecture/ })
    .first()
    .click({ force: true })
  await expect(page.getByTestId('architecture-panel')).toBeVisible({ timeout: 10_000 })
}

async function seedModel(page: Page, projectPath: string, nodes: SeedNode[]): Promise<void> {
  const result = await page.evaluate(
    async ({ nextProjectPath, nextNodes }) => {
      return window.api.architecture.executeScryerOperation({
        projectPath: nextProjectPath,
        operationId: 'scryer.model.set',
        input: {
          data: {
            version: '0.3',
            nodes: nextNodes,
            links: [],
            groups: [],
            sourceMap: {},
            boundaries: {}
          }
        }
      })
    },
    { nextProjectPath: projectPath, nextNodes: nodes }
  )
  expect(result).toMatchObject({ ok: true })
}

async function setLongLivedAgent(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__store?.setState((state) => ({
      settings: {
        ...state.settings,
        defaultTuiAgent: 'codex',
        agentCmdOverrides: {
          ...state.settings?.agentCmdOverrides,
          // Keep the agent PTY alive so main does not reconcile the lease as a crash
          // before the trusted Engine runner writes the subtree under it.
          codex: 'node -e "setTimeout(()=>{},30000)"'
        }
      }
    }))
  })
}

const HOOK_STUB_FILENAME = '.e2e-agent-hook-stub.cjs'
const FILL_DONE_SENTINEL = '.e2e-fill-done'

// Why: the success terminal is driven by the production Stop-hook protocol. This stub
// runs as the launched agent's own pane process and, once the trusted Engine fill has
// landed (sentinel), emits the same authenticated POST the managed claude hook script
// sends — built exclusively from the hook coordinates and pane identity main injected
// into this pane's env at spawn. It then idles so PTY teardown never races the gate as
// crash evidence.
const HOOK_STUB_LOG = '.e2e-hook-stub-log'

// The stub embeds absolute sentinel/log paths at generation time so it works
// regardless of the cwd the agent pane's shell happens to start in.
const buildHookStubSource = (worktreePath: string): string => `
const fs = require('node:fs')
const http = require('node:http')
const sentinel = ${JSON.stringify(path.join(worktreePath, FILL_DONE_SENTINEL))}
const logPath = ${JSON.stringify(path.join(worktreePath, HOOK_STUB_LOG))}
// Diagnostic breadcrumbs only (booleans and the local port, never token values):
// the test reads this log to distinguish "stub never saw the sentinel" from
// "callback sent but rejected" when the terminal assertion fails.
const log = (line) => {
  try {
    fs.appendFileSync(logPath, line + '\\n')
  } catch {}
}
log('start cwd=' + process.cwd())
log(
  'env port=' + (process.env.ORCA_AGENT_HOOK_PORT || 'ABSENT') +
  ' tokenPresent=' + Boolean(process.env.ORCA_AGENT_HOOK_TOKEN) +
  ' paneKey=' + (process.env.ORCA_PANE_KEY || 'ABSENT') +
  ' tabId=' + (process.env.ORCA_TAB_ID || 'ABSENT')
)
const startedAt = Date.now()
const timer = setInterval(() => {
  if (fs.existsSync(sentinel)) {
    clearInterval(timer)
    log('sentinel seen')
    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'e2e-fill-agent',
      stop_hook_active: false,
      last_assistant_message: 'Container generation complete'
    })
    const body = new URLSearchParams({
      paneKey: process.env.ORCA_PANE_KEY || '',
      tabId: process.env.ORCA_TAB_ID || '',
      launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN || '',
      worktreeId: process.env.ORCA_WORKTREE_ID || '',
      env: process.env.ORCA_AGENT_HOOK_ENV || '',
      version: process.env.ORCA_AGENT_HOOK_VERSION || '',
      payload
    }).toString()
    const req = http.request({
      host: '127.0.0.1',
      port: Number(process.env.ORCA_AGENT_HOOK_PORT),
      path: '/hook/claude',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Orca-Agent-Hook-Token': process.env.ORCA_AGENT_HOOK_TOKEN || '',
        'Content-Length': Buffer.byteLength(body)
      }
    })
    req.on('response', (res) => log('response status=' + res.statusCode))
    req.on('error', (error) => log('request error=' + String(error && error.message)))
    req.end(body)
  } else if (Date.now() - startedAt > 60000) {
    clearInterval(timer)
    log('sentinel timeout')
  }
}, 250)
setTimeout(() => {}, 120000)
`

async function setHookEmittingAgent(page: Page, worktreePath: string): Promise<void> {
  const stubPath = path.join(worktreePath, HOOK_STUB_FILENAME)
  writeFileSync(stubPath, buildHookStubSource(worktreePath))
  rmSync(path.join(worktreePath, FILL_DONE_SENTINEL), { force: true })
  rmSync(path.join(worktreePath, HOOK_STUB_LOG), { force: true })
  // Absolute node path: the pane shell's PATH is not guaranteed to resolve `node`.
  // The leading `echo` writes shell-level evidence that the launch command line ran
  // at all, independent of node succeeding.
  const logPath = path.join(worktreePath, HOOK_STUB_LOG)
  const launchCommand = `echo launched >> ${logPath}; ${process.execPath} ${stubPath}`
  await page.evaluate((command) => {
    window.__store?.setState((state) => ({
      settings: {
        ...state.settings,
        defaultTuiAgent: 'codex',
        agentCmdOverrides: {
          ...state.settings?.agentCmdOverrides,
          codex: command
        }
      }
    }))
  }, launchCommand)
}

async function drillInto(page: Page, nodeName: string): Promise<void> {
  const treeNode = page.getByTestId('architecture-tree-node').filter({ hasText: nodeName })
  await expect(treeNode.first()).toBeVisible({ timeout: 10_000 })
  await treeNode.first().getByTestId('architecture-tree-drill-node').click({ force: true })
}

async function currentTabIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const activeWorktreeId = state?.activeWorktreeId
    return activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []).map((t) => t.id) : []
  })
}

async function launchFillAndResolveAgentTab(page: Page): Promise<string> {
  const before = await currentTabIds(page)
  await expect(page.getByTestId('architecture-fill-ai')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('architecture-fill-ai').click({ force: true })
  let agentTabId: string | null = null
  await expect
    .poll(
      async () => {
        agentTabId = await page.evaluate((prev) => {
          const state = window.__store?.getState()
          const activeWorktreeId = state?.activeWorktreeId
          const tabs = activeWorktreeId ? (state?.tabsByWorktree[activeWorktreeId] ?? []) : []
          return tabs.find((t) => !prev.includes(t.id))?.id ?? null
        }, before)
        return agentTabId
      },
      { timeout: 15_000 }
    )
    .not.toBeNull()
  if (!agentTabId) {
    throw new Error('Fill with AI did not launch an agent tab')
  }
  return agentTabId
}

// Diagnostic only: the visible content of the launched agent pane, so a broken
// stub launch fails with "what the terminal actually ran" instead of a bare timeout.
async function readAgentPaneText(page: Page, tabId: string): Promise<string> {
  return page.evaluate((id) => {
    const manager = window.__paneManagers?.get(id)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    const rows = pane?.container.querySelector<HTMLElement>('.xterm-rows')
    return rows?.innerText ?? '(terminal DOM unavailable)'
  }, tabId)
}

type LeaseStatus = { activeLease: { owner?: string; agentRunId?: string } | null }

async function readEditSession(page: Page, projectPath: string): Promise<LeaseStatus> {
  // Why: reads can transiently race the exclusive .scryer lock while an operation or a
  // session cancellation holds it; retry rather than surfacing the lock as a hard error.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await page.evaluate(
        async (nextProjectPath) =>
          (await window.api.architecture.readEditSession({
            projectPath: nextProjectPath
          })) as LeaseStatus,
        projectPath
      )
    } catch (error) {
      if (attempt === 5 || !/lock is already held/i.test(String(error))) {
        throw error
      }
      await page.waitForTimeout(150)
    }
  }
  throw new Error('readEditSession exhausted retries')
}

async function reportAgentDone(
  page: Page,
  agentTabId: string,
  interrupted: boolean
): Promise<void> {
  await page.evaluate(
    ({ tabId, wasInterrupted }) => {
      window.__store?.getState().setAgentStatus(
        `${tabId}:0`,
        {
          state: 'done',
          prompt: 'Container generation',
          agentType: 'codex',
          lastAssistantMessage: 'done',
          ...(wasInterrupted ? { interrupted: true } : {})
        },
        '* Codex done',
        { updatedAt: Date.now() + 1_000, stateStartedAt: Date.now() + 1_000 }
      )
    },
    { tabId: agentTabId, wasInterrupted: interrupted }
  )
}

function scryerFile(projectPath: string, name: 'model.scry' | 'planned.scry'): string {
  return path.join(projectPath, '.scryer', name)
}

function fingerprint(filePath: string): string {
  if (!existsSync(filePath)) {
    return 'ABSENT'
  }
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function modelContainsNode(filePath: string, nodeName: string): boolean {
  if (!existsSync(filePath)) {
    return false
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { nodes?: { name?: string }[] }
  return (parsed.nodes ?? []).some((node) => node.name === nodeName)
}

function nodeHasChildren(filePath: string, parentId: string): boolean {
  if (!existsSync(filePath)) {
    return false
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { nodes?: { parentId?: string }[] }
  return (parsed.nodes ?? []).some((node) => node.parentId === parentId)
}

const VALID_PROPOSAL = {
  container_id: 'api',
  components: [
    {
      key: 'orders',
      name: 'Orders',
      symbols: [
        {
          key: 'handleOrder',
          name: 'handleOrder',
          source_file: 'src/orders.ts',
          line: 10,
          end_line: 40,
          responsibilities: ['Handles an order request']
        }
      ]
    }
  ]
}

// A structurally invalid proposal (a component with no symbols): the Engine rejects it
// atomically before any write, so nothing lands on either layer.
const INVALID_PROPOSAL = {
  container_id: 'api',
  components: [{ key: 'orders', name: 'Orders', symbols: [] }]
}

async function seedEmptyContainerAndDrillIn(page: Page, worktreePath: string): Promise<void> {
  rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
  await openArchitectureTab(page)
  await seedModel(page, worktreePath, [
    { id: 'shop', kind: 'system', name: 'Shop', description: 'Commerce system' },
    { id: 'api', kind: 'container', name: 'API', description: 'HTTP API', parentId: 'shop' }
  ])
  await drillInto(page, 'Shop')
  await drillInto(page, 'API')
  await expect(page.getByTestId('architecture-fill-ai')).toBeVisible({ timeout: 10_000 })
}

test.describe('Architecture Fill with AI container generation', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(() => {
    // Why: the E2E build (electron-vite) does not emit the per-file Engine module. The
    // trusted-path success and validation tests drive the real Engine, so compile it once
    // here. If the compile fails, the dependent tests surface a hard error, never a false
    // pass.
    if (!existsSync(ENGINE_ENTRY)) {
      execFileSync(
        'npx',
        [
          'tsc',
          '-p',
          'config/tsconfig.cli.json',
          '--outDir',
          ENGINE_OUT_DIR,
          '--composite',
          'false',
          '--incremental',
          'false'
        ],
        { cwd: REPO_ROOT, stdio: 'inherit' }
      )
    }
    expect(existsSync(ENGINE_ENTRY)).toBe(true)
    writeFileSync(RUNNER_PATH, RUNNER_SOURCE)
  })

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
  })

  test('acquires the edit-session lease before any subtree write and shows a running state', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    await setLongLivedAgent(orcaPage)
    await seedEmptyContainerAndDrillIn(orcaPage, worktreePath)

    const agentTabId = await launchFillAndResolveAgentTab(orcaPage)

    // Visible running state: the fill foregrounds a live agent terminal.
    await expect(orcaPage.locator('.xterm:visible').first()).toBeVisible({ timeout: 10_000 })

    // Lease is acquired for THIS agent run before the agent can write.
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease?.agentRunId, {
        timeout: 15_000
      })
      .toBe(agentTabId)
    const lease = (await readEditSession(orcaPage, worktreePath)).activeLease
    expect(lease?.owner).toBe('agent')

    // Ordering: no subtree has been written at the moment the lease exists.
    expect(nodeHasChildren(scryerFile(worktreePath, 'model.scry'), 'api')).toBe(false)
    expect(nodeHasChildren(scryerFile(worktreePath, 'planned.scry'), 'api')).toBe(false)

    // Re-activated panel still offers Fill for the empty container — no false terminal yet.
    await activateArchitectureTab(orcaPage)
    await expect(orcaPage.getByText('Container generated with AI')).toHaveCount(0)
  })

  test('generates the container subtree through the trusted agent path with real Engine file effects', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    await setLongLivedAgent(orcaPage)
    await seedEmptyContainerAndDrillIn(orcaPage, worktreePath)
    // Source file the proposal anchors to; keeps generation source-mapping honest.
    mkdirSync(path.join(worktreePath, 'src'), { recursive: true })
    writeFileSync(
      path.join(worktreePath, 'src', 'orders.ts'),
      'export const handleOrder = () => {}\n'
    )

    const agentTabId = await launchFillAndResolveAgentTab(orcaPage)
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease?.agentRunId, {
        timeout: 15_000
      })
      .toBe(agentTabId)

    // The agent runs its single container generation under the acquired lease, authorized
    // by the trusted runtime identity (no lease token in args).
    const fill = runContainerFill({ worktreePath, agentTabId, proposal: VALID_PROPOSAL })
    expect(fill.status, `fill stderr: ${fill.stderr}`).toBe(0)

    // Engine atomic transaction wrote BOTH layers (committed mirror + planned).
    await expect
      .poll(() => nodeHasChildren(scryerFile(worktreePath, 'model.scry'), 'api'), {
        timeout: 10_000
      })
      .toBe(true)
    expect(nodeHasChildren(scryerFile(worktreePath, 'planned.scry'), 'api')).toBe(true)
    expect(modelContainsNode(scryerFile(worktreePath, 'model.scry'), 'Orders')).toBe(true)
    expect(modelContainsNode(scryerFile(worktreePath, 'planned.scry'), 'Orders')).toBe(true)

    // The run reflects on agent-done and reloads the model: the generated subtree appears
    // in the visible view (watcher/reload refresh), not just on disk.
    await reportAgentDone(orcaPage, agentTabId, false)
    await activateArchitectureTab(orcaPage)
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Orders' }).first()
    ).toBeVisible({ timeout: 15_000 })
  })

  // The visible SUCCESS terminal, driven end-to-end through the production done-signal
  // chain: the launched agent pane's stub emits the authenticated Stop-hook HTTP POST
  // (the same callback the managed claude hook script sends, built from the pane env
  // main injected at spawn) -> agent-hook server ingest -> native agent-run runtime ->
  // edit-session controller -> Completion Gate (nothing_to_fold; container.fill mirrors
  // both layers) -> lease release -> visible "Container generated with AI". Renderer
  // setAgentStatus is NOT used: main's runtime only trusts the hook-server signal.
  test('reaches a visible success terminal once the completion gate passes', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    await setHookEmittingAgent(orcaPage, worktreePath)
    await seedEmptyContainerAndDrillIn(orcaPage, worktreePath)
    mkdirSync(path.join(worktreePath, 'src'), { recursive: true })
    writeFileSync(path.join(worktreePath, 'src', 'orders.ts'), 'export const x = () => {}\n')

    const agentTabId = await launchFillAndResolveAgentTab(orcaPage)
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease?.agentRunId, {
        timeout: 15_000
      })
      .toBe(agentTabId)
    const fill = runContainerFill({ worktreePath, agentTabId, proposal: VALID_PROPOSAL })
    expect(fill.status).toBe(0)
    // Release the stub: from here on, every step to the visible terminal is production
    // code reacting to the real Stop-hook HTTP callback.
    writeFileSync(path.join(worktreePath, FILL_DONE_SENTINEL), 'done\n')

    // Diagnostic gate: the stub's callback must be accepted (204) by the agent-hook
    // server. On failure the stub log plus the pane's visible content pinpoint which
    // leg broke (stub never launched / env missing / callback rejected).
    try {
      await expect
        .poll(
          () => {
            const logPath = path.join(worktreePath, HOOK_STUB_LOG)
            return existsSync(logPath) ? readFileSync(logPath, 'utf8') : '(no stub log)'
          },
          { timeout: 15_000 }
        )
        .toContain('response status=204')
    } catch (error) {
      const paneText = await readAgentPaneText(orcaPage, agentTabId)
      throw new Error(`stub hook callback not confirmed; agent pane shows:\n${paneText}`, {
        cause: error
      })
    }

    // Diagnostic gate: the accepted callback must fan out as a `done` status for
    // this run's pane. On failure the polled snapshot shows every pane's status,
    // separating an ingest/alias drop from a runtime/controller failure.
    await expect
      .poll(
        () =>
          orcaPage.evaluate((tabId) => {
            const entries = Object.entries(
              window.__store?.getState().agentStatusByPaneKey ?? {}
            ).map(([paneKey, entry]) => `${paneKey}=${(entry as { state?: string }).state}`)
            return `${entries.join(' | ') || '(empty)'} [want ${tabId}:*=done]`
          }, agentTabId),
        { timeout: 15_000 }
      )
      .toMatch(new RegExp(`${agentTabId}:[^=]*=done`))

    // Completion Gate passed (nothing_to_fold, container.fill mirrors both layers) and
    // the lease is released by the production done-signal chain.
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease, {
        timeout: 30_000
      })
      .toBeNull()
    await activateArchitectureTab(orcaPage)
    await expect(orcaPage.getByText('Container generated with AI')).toBeVisible({
      timeout: 15_000
    })
  })

  test('rejects an invalid proposal atomically without partial writes and never claims success', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    await setLongLivedAgent(orcaPage)
    await seedEmptyContainerAndDrillIn(orcaPage, worktreePath)

    const agentTabId = await launchFillAndResolveAgentTab(orcaPage)
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease?.agentRunId, {
        timeout: 15_000
      })
      .toBe(agentTabId)

    const committedBefore = fingerprint(scryerFile(worktreePath, 'model.scry'))
    const plannedBefore = fingerprint(scryerFile(worktreePath, 'planned.scry'))

    // The agent's fill errors inside the atomic transaction: nothing is written.
    const fill = runContainerFill({ worktreePath, agentTabId, proposal: INVALID_PROPOSAL })
    expect(fill.status).not.toBe(0)

    // No partial write on EITHER layer (two-layer fingerprint unchanged).
    expect(fingerprint(scryerFile(worktreePath, 'model.scry'))).toBe(committedBefore)
    expect(fingerprint(scryerFile(worktreePath, 'planned.scry'))).toBe(plannedBefore)
    expect(nodeHasChildren(scryerFile(worktreePath, 'model.scry'), 'api')).toBe(false)
    expect(nodeHasChildren(scryerFile(worktreePath, 'planned.scry'), 'api')).toBe(false)

    // The run reflects on agent-done; with no generated subtree it never claims success.
    await reportAgentDone(orcaPage, agentTabId, false)
    await activateArchitectureTab(orcaPage)
    await expect(
      orcaPage.getByTestId('architecture-tree-node').filter({ hasText: 'Orders' })
    ).toHaveCount(0)
    await expect(orcaPage.getByText('Container generated with AI')).toHaveCount(0)
  })

  test('cancels the run and releases the lease when the agent terminal is torn down', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    await setLongLivedAgent(orcaPage)
    await seedEmptyContainerAndDrillIn(orcaPage, worktreePath)

    const agentTabId = await launchFillAndResolveAgentTab(orcaPage)
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease?.agentRunId, {
        timeout: 15_000
      })
      .toBe(agentTabId)

    // Tear down the agent terminal: main's runtime observes the termination and reconciles
    // the session by cancelling it (a vanished run is never a completion).
    await orcaPage.evaluate((tabId) => window.__store?.getState().closeTab(tabId), agentTabId)

    // Lease released / reconciled on cancellation.
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease, {
        timeout: 15_000
      })
      .toBeNull()

    // No subtree written and no false success.
    await activateArchitectureTab(orcaPage)
    expect(nodeHasChildren(scryerFile(worktreePath, 'model.scry'), 'api')).toBe(false)
    await expect(orcaPage.getByText('Container generated with AI')).toHaveCount(0)
  })

  test('holds the lease against conflicting writes without leaking the token', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    await setLongLivedAgent(orcaPage)
    await seedEmptyContainerAndDrillIn(orcaPage, worktreePath)

    // A live fill holds the edit-session lease for its agent run.
    const agentTabId = await launchFillAndResolveAgentTab(orcaPage)
    await expect
      .poll(async () => (await readEditSession(orcaPage, worktreePath)).activeLease?.agentRunId, {
        timeout: 15_000
      })
      .toBe(agentTabId)

    // The session-status surface exposes owner/agentRunId but never the lease token.
    const lease = (await readEditSession(orcaPage, worktreePath)).activeLease
    expect(lease).toMatchObject({ owner: 'agent', agentRunId: agentTabId })
    expect(Object.keys(lease ?? {})).not.toContain('token')
    expect(JSON.stringify(lease)).not.toMatch(/token/i)

    // A conflicting semantic write is blocked while the lease is active, and the block
    // reason is token-free (names the lease/session, never the opaque token material).
    const writeError = await orcaPage.evaluate(async (nextProjectPath) => {
      const result = await window.api.architecture.executeScryerOperation({
        projectPath: nextProjectPath,
        operationId: 'scryer.node.update',
        input: { nodes: [{ node_id: 'api', name: 'Hijacked During Fill' }] }
      })
      return result.ok ? null : result.error.message
    }, worktreePath)
    expect(writeError, 'conflicting write must be blocked').not.toBeNull()
    expect(writeError ?? '').toMatch(/lease|session/i)
    expect(writeError ?? '').not.toMatch(/token/i)

    // The blocked write left no partial subtree, and the panel DOM leaks no token.
    expect(nodeHasChildren(scryerFile(worktreePath, 'model.scry'), 'api')).toBe(false)
    await activateArchitectureTab(orcaPage)
    const panelText = (await orcaPage.getByTestId('architecture-panel').textContent()) ?? ''
    expect(panelText).not.toMatch(/token/i)
  })

  test('directs the default fill path at container generation, never set_node', async ({
    orcaPage
  }) => {
    const worktreePath = await getActiveWorktreePath(orcaPage)
    rmSync(path.join(worktreePath, '.scryer'), { recursive: true, force: true })
    await openArchitectureTab(orcaPage)
    await seedModel(orcaPage, worktreePath, [
      { id: 'shop', kind: 'system', name: 'Shop', description: 'Commerce system' },
      { id: 'api', kind: 'container', name: 'API', description: 'HTTP API', parentId: 'shop' }
    ])

    const prompt = await orcaPage.evaluate(async (nextProjectPath) => {
      const result = (await window.api.architecture.prepareNodeFillPrompt({
        projectPath: nextProjectPath,
        modelName: 'model',
        nodeId: 'api'
      })) as { prompt: string }
      return result.prompt
    }, worktreePath)

    expect(prompt).toContain('orca scryer container fill')
    expect(prompt).not.toContain('set_node')
  })
})
