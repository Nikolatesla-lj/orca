import type {
  BrowserProfileCreateResult,
  BrowserProfileDeleteResult,
  BrowserProfileListResult
} from '../../shared/runtime-types'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { formatBrowserProfileList, printResult } from '../format'

export const BROWSER_PROFILE_HANDLERS: Record<string, CommandHandler> = {
  'tab profile list': async ({ client, json }) => {
    const result = await client.call<BrowserProfileListResult>('browser.profileList')
    printResult(result, json, formatBrowserProfileList)
  },
  'tab profile create': async ({ flags, client, json }) => {
    const label = getRequiredStringFlag(flags, 'label')
    const scope = getOptionalStringFlag(flags, 'scope') === 'imported' ? 'imported' : 'isolated'
    const result = await client.call<BrowserProfileCreateResult>('browser.profileCreate', {
      label,
      scope
    })
    printResult(
      result,
      json,
      (value) => `Created profile ${value.profile?.id ?? 'unknown'} (${value.profile?.label ?? label})`
    )
  },
  'tab profile delete': async ({ flags, client, json }) => {
    const profileId = getRequiredStringFlag(flags, 'profile')
    const result = await client.call<BrowserProfileDeleteResult>('browser.profileDelete', {
      profileId
    })
    printResult(result, json, (value) => (value.deleted ? `Deleted profile ${value.profileId}` : `Profile ${value.profileId} was not deleted`))
  }
}
