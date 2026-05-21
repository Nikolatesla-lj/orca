import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createTabsSlice } from './tabs'
import { createArchitectureSlice } from './architecture'

function createArchitectureStore() {
  return create<AppState>()(
    (...a) =>
      ({
        ...createTabsSlice(...a),
        ...createArchitectureSlice(...a),
        worktreesByRepo: {
          repo: [
            {
              id: 'repo::/workspace/current',
              repoId: 'repo',
              path: '/workspace/current'
            }
          ]
        }
      }) as unknown as AppState
  )
}

describe('ArchitectureSlice', () => {
  it('updates the project path for an existing architecture tab', () => {
    const store = createArchitectureStore()
    const workspace = store.getState().createArchitectureTab('repo::/workspace/current', {
      projectPath: '/workspace/current',
      title: 'Architecture'
    })

    store.getState().setArchitectureProjectPath(workspace.id, '/workspace/selected')

    expect(store.getState().architectureTabsByWorktree['repo::/workspace/current']).toContainEqual(
      expect.objectContaining({
        id: workspace.id,
        projectPath: '/workspace/selected'
      })
    )
  })
})
