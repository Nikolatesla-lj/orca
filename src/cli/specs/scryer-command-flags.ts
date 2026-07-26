import { GLOBAL_FLAGS } from '../args'

// Why: the edit-session lease token is trusted runtime context, never a public
// CLI argument; it must not enter process args, prompts, or help output.
export const SCRYER_FLAGS = [...GLOBAL_FLAGS, 'project']
