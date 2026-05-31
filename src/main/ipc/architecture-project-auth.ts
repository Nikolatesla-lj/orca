import { resolve } from 'path'
import type { Store } from '../persistence'
import { resolveAuthorizedPath } from './filesystem-auth'

export async function assertAuthorizedArchitectureProjectPath(
  projectPath: string,
  store: Store
): Promise<string> {
  try {
    return await resolveAuthorizedPath(resolve(projectPath), store)
  } catch (error) {
    const denied = new Error('Architecture project path is not authorized')
    denied.cause = error
    throw denied
  }
}
