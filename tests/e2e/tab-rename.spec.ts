/**
 * E2E tests for inline tab renaming (double-click a tab to rename).
 *
 * User Prompt:
 * - double-click a tab to rename it inline
 */

import { test, expect } from './helpers/orca-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getActiveTabId,
  getWorktreeTabs,
  ensureTerminalVisible
} from './helpers/store'

test.describe('Tab Rename (Inline)', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    // Why: clear any custom titles left by a previous test (the Electron app
    // persists across tests in the worker) so tab locators key off the default
    // title, not a stale rename like "My Custom Title".
    await orcaPage.evaluate(() => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      for (const tabs of Object.values(state.tabsByWorktree)) {
        for (const tab of tabs) {
          if (tab.customTitle != null) {
            state.setTabCustomTitle(tab.id, null)
          }
        }
      }
    })
  })

  async function getActiveTabTitle(
    page: Parameters<typeof getActiveTabId>[0],
    worktreeId: string
  ): Promise<string> {
    const activeId = await getActiveTabId(page)
    expect(activeId).not.toBeNull()
    const tabs = await getWorktreeTabs(page, worktreeId)
    const tab = tabs.find((entry) => entry.id === activeId)
    expect(tab).toBeDefined()
    // Why: mirror what the UI renders (customTitle ?? title) so locators that
    // key off the tab's visible text match what's actually on screen.
    return tab!.customTitle ?? tab!.title ?? ''
  }

  function tabLocatorByTitle(
    page: Parameters<typeof getActiveTabId>[0],
    title: string
  ): ReturnType<Parameters<typeof getActiveTabId>[0]['locator']> {
    // Why: backslash first so the backslashes we introduce when escaping the
    // double-quote aren't themselves re-escaped; both chars are CSS-selector
    // metacharacters inside a double-quoted attribute value.
    const escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return page.locator(`[data-testid="sortable-tab"][data-tab-title="${escaped}"]`).first()
  }

  async function getActiveCustomTitle(
    page: Parameters<typeof getActiveTabId>[0],
    worktreeId: string
  ): Promise<string | null> {
    return page.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return null
      }

      const state = store.getState()
      const activeId = state.activeTabIdByWorktree[targetWorktreeId] ?? state.activeTabId
      const tab = (state.tabsByWorktree[targetWorktreeId] ?? []).find((t) => t.id === activeId)
      return tab?.customTitle ?? null
    }, worktreeId)
  }

  async function setActiveCustomTitle(
    page: Parameters<typeof getActiveTabId>[0],
    worktreeId: string,
    title: string
  ): Promise<string> {
    const tabId = await page.evaluate(
      ({ targetWorktreeId, title }) => {
        const store = window.__store
        if (!store) {
          return null
        }

        const state = store.getState()
        const activeId = state.activeTabIdByWorktree[targetWorktreeId] ?? state.activeTabId
        if (activeId) {
          state.setTabCustomTitle(activeId, title)
        }
        return activeId
      },
      { targetWorktreeId: worktreeId, title }
    )
    expect(tabId).not.toBeNull()
    await expect
      .poll(async () => getActiveCustomTitle(page, worktreeId), { timeout: 3_000 })
      .toBe(title)
    await expect(tabLocatorByTitle(page, title)).toBeVisible()
    return tabId!
  }

  test('double-clicking a tab opens an inline rename input and Enter commits', async ({
    orcaPage
  }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!
    const originalTitle = 'Rename Seed Enter'
    await setActiveCustomTitle(orcaPage, worktreeId, originalTitle)

    const tabLocator = tabLocatorByTitle(orcaPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('My Custom Title')
    await renameInput.press('Enter')

    await expect
      .poll(async () => getActiveCustomTitle(orcaPage, worktreeId), { timeout: 3_000 })
      .toBe('My Custom Title')
    await expect(renameInput).toBeHidden()
    await expect(tabLocatorByTitle(orcaPage, 'My Custom Title')).toBeVisible()
  })

  test('Escape during inline rename discards the edit', async ({ orcaPage }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!
    const originalTitle = 'Rename Seed Escape'
    await setActiveCustomTitle(orcaPage, worktreeId, originalTitle)

    const tabLocator = tabLocatorByTitle(orcaPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('Should Be Discarded')
    await renameInput.press('Escape')

    await expect(renameInput).toBeHidden()
    // Why: the final assertion must be on user-observable DOM, not only the
    // store. A render-layer bug could leave the discarded label painted.
    await expect(tabLocatorByTitle(orcaPage, originalTitle)).toBeVisible()
    await expect
      .poll(async () => getActiveCustomTitle(orcaPage, worktreeId), { timeout: 3_000 })
      .toBe(originalTitle)
  })

  test('renaming to an empty string resets the tab to its default title', async ({ orcaPage }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!

    // Snapshot the default (non-custom) title first to make sure the tab has
    // rendered before we seed the custom title.
    const defaultTitle = await getActiveTabTitle(orcaPage, worktreeId)
    expect(defaultTitle.length).toBeGreaterThan(0)

    // Why: seed a custom title directly via the store so this test asserts the
    // "empty string → reset" behavior independently from the double-click flow.
    await orcaPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }

      const state = store.getState()
      const activeId = state.activeTabIdByWorktree[targetWorktreeId] ?? state.activeTabId
      if (activeId) {
        state.setTabCustomTitle(activeId, 'Seeded Custom')
      }
    }, worktreeId)

    await expect
      .poll(async () => getActiveCustomTitle(orcaPage, worktreeId), { timeout: 3_000 })
      .toBe('Seeded Custom')

    const tabLocator = tabLocatorByTitle(orcaPage, 'Seeded Custom')
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: 'Rename tab Seeded Custom',
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('')
    await renameInput.press('Enter')

    await expect
      .poll(async () => getActiveCustomTitle(orcaPage, worktreeId), { timeout: 3_000 })
      .toBe(null)
    // User-observable DOM assertion: the custom title is gone. The underlying
    // shell may update the default title asynchronously, so do not pin this to
    // the earlier "Terminal N" snapshot.
    await expect(tabLocatorByTitle(orcaPage, 'Seeded Custom')).toBeHidden()
    const resetTitle = await getActiveTabTitle(orcaPage, worktreeId)
    expect(resetTitle).not.toBe('Seeded Custom')
    await expect(tabLocatorByTitle(orcaPage, resetTitle)).toBeVisible()
  })

  test('clicking away (blur) commits the rename', async ({ orcaPage }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!

    // Why: need a second tab so we have something to click that isn't the
    // rename input itself. Seed both with known titles so we can locate them.
    await orcaPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      const existing = state.tabsByWorktree[targetWorktreeId] ?? []
      if (existing.length < 2) {
        state.createTab(targetWorktreeId)
      }
    }, worktreeId)

    await expect
      .poll(async () => (await getWorktreeTabs(orcaPage, worktreeId)).length, { timeout: 3_000 })
      .toBeGreaterThanOrEqual(2)

    const tabs = await getWorktreeTabs(orcaPage, worktreeId)
    const activeId = await getActiveTabId(orcaPage)
    const activeTab = tabs.find((t) => t.id === activeId)!
    const otherTab = tabs.find((t) => t.id !== activeId)!
    await orcaPage.evaluate(
      ({ targetWorktreeId, activeTabId, otherTabId }) => {
        const store = window.__store
        if (!store) {
          return
        }
        const state = store.getState()
        state.setTabCustomTitle(activeTabId, 'Rename Seed Blur Active')
        state.setTabCustomTitle(otherTabId, 'Rename Seed Blur Other')
        state.setActiveTab(activeTabId, targetWorktreeId)
      },
      {
        targetWorktreeId: worktreeId,
        activeTabId: activeTab.id,
        otherTabId: otherTab.id
      }
    )
    await expect(tabLocatorByTitle(orcaPage, 'Rename Seed Blur Active')).toBeVisible()

    const tabLocator = tabLocatorByTitle(orcaPage, 'Rename Seed Blur Active')
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: 'Rename tab Rename Seed Blur Active',
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('Committed By Blur')
    // Why: clicking the other tab triggers blur on the input, which should
    // run commitRename and save the typed title before the focus shifts.
    await tabLocatorByTitle(orcaPage, 'Rename Seed Blur Other').click()

    await expect(renameInput).toBeHidden()
    await expect(tabLocatorByTitle(orcaPage, 'Committed By Blur')).toBeVisible()
    expect(
      await orcaPage.evaluate(
        ({ targetWorktreeId, targetTabId }) => {
          const store = window.__store
          const state = store!.getState()
          const tab = (state.tabsByWorktree[targetWorktreeId] ?? []).find(
            (t) => t.id === targetTabId
          )
          return tab?.customTitle ?? null
        },
        { targetWorktreeId: worktreeId, targetTabId: activeTab.id }
      )
    ).toBe('Committed By Blur')
  })

  test('right-clicking during inline rename commits and opens context menu', async ({
    orcaPage
  }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!
    const originalTitle = 'Rename Seed Right Click'
    await setActiveCustomTitle(orcaPage, worktreeId, originalTitle)

    const tabLocator = tabLocatorByTitle(orcaPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    await renameInput.fill('Committed By Right Click')
    // Why: right-clicking the tab blurs the input (commitRename runs) and
    // opens the context menu. We assert the rename was saved; the menu
    // assertion is intentionally light because the menu markup is shared
    // with other specs.
    await tabLocator.click({ button: 'right' })

    await expect
      .poll(async () => getActiveCustomTitle(orcaPage, worktreeId), { timeout: 3_000 })
      .toBe('Committed By Right Click')
    await expect(renameInput).toBeHidden()
  })

  test('rename input stays at a usable width when many tabs are open', async ({ orcaPage }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!

    // Why: create enough terminal tabs that flex space runs out. 15 is well
    // above the threshold at which the pre-fix input collapsed, and it keeps
    // the test fast. The width fix pins the input to 72px (matching the
    // slimmer tab title box), so even saturated, it should stay near that
    // size — we assert ≥60px to allow a bit of slack for fonts/padding/
    // containers differing between environments. The meaningful guarantee is
    // that the input does not collapse to ~0 when flex space is saturated.
    await orcaPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      const existing = (state.tabsByWorktree[targetWorktreeId] ?? []).length
      for (let i = existing; i < 15; i++) {
        state.createTab(targetWorktreeId)
      }
    }, worktreeId)

    await expect
      .poll(async () => (await getWorktreeTabs(orcaPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(15)

    await setActiveCustomTitle(orcaPage, worktreeId, 'Rename Seed Many Tabs')
    const stableTitle = 'Rename Seed Many Tabs'
    const tabLocator = tabLocatorByTitle(orcaPage, stableTitle)
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: `Rename tab ${stableTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    const box = await renameInput.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(60)
  })

  test('middle-clicking inside the rename input does not close the tab', async ({ orcaPage }) => {
    const worktreeId = (await getActiveWorktreeId(orcaPage))!
    const tabsBefore = (await getWorktreeTabs(orcaPage, worktreeId)).length
    const originalTitle = 'Rename Seed Middle Click'
    await setActiveCustomTitle(orcaPage, worktreeId, originalTitle)

    const tabLocator = tabLocatorByTitle(orcaPage, originalTitle)
    await tabLocator.dblclick()

    const renameInput = orcaPage.getByRole('textbox', {
      name: `Rename tab ${originalTitle}`,
      exact: true
    })
    await expect(renameInput).toBeVisible()

    // Why: the outer tab's middle-click handler closes the tab. The rename
    // input stops propagation + preventDefaults middle-click so the tab
    // isn't closed while the user is editing.
    await renameInput.click({ button: 'middle' })

    // The tab must still exist — no regression where editing-then-middle-click
    // accidentally closes the tab out from under the input.
    expect((await getWorktreeTabs(orcaPage, worktreeId)).length).toBe(tabsBefore)
  })
})
