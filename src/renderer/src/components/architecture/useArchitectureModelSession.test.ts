import { describe, expect, it } from 'vitest'
import {
  isActiveArchitectureModelChange,
  sanitizeClientModelName
} from './useArchitectureModelSession'

describe('architecture model session helpers', () => {
  it('normalizes renderer model names to the Scryer default model name', () => {
    expect(sanitizeClientModelName(null)).toBe('model')
    expect(sanitizeClientModelName('Model.scry')).toBe('model')
    expect(sanitizeClientModelName('Release Plan')).toBe('release-plan')
  })

  it('treats planned.scry as the active plan layer for the default model only', () => {
    expect(isActiveArchitectureModelChange('model.scry', 'model')).toBe(true)
    expect(isActiveArchitectureModelChange('planned.scry', 'model')).toBe(true)
    expect(isActiveArchitectureModelChange('planned.scry', 'release-plan')).toBe(false)
    expect(isActiveArchitectureModelChange('release-plan.scry', 'release-plan')).toBe(true)
  })
})
