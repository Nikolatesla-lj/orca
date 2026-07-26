import type { CommandSpec } from '../args'
import { SCRYER_FLAGS } from './scryer-command-flags'

// Why: the node/group/source/model authoring specs are split out of scryer.ts
// so each command-spec module stays under the max-lines budget.
export const SCRYER_AUTHORING_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['scryer', 'person', 'add'],
    summary: 'Author planned Scryer person nodes',
    usage: 'orca scryer person add --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain a non-empty `items` array.'],
    examples: [
      'echo \'{"items":[{"name":"Customer"}]}\' | orca scryer person add --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'system', 'add'],
    summary: 'Author planned Scryer system nodes',
    usage: 'orca scryer system add --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain a non-empty `items` array.'],
    examples: [
      'echo \'{"items":[{"name":"Shop"}]}\' | orca scryer system add --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'container', 'add'],
    summary: 'Author planned Scryer container nodes under a system',
    usage: 'orca scryer container add --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: [
      'The JSON input must contain a non-empty `items` array; each item needs a `parent_id`.'
    ],
    examples: [
      'echo \'{"items":[{"name":"API","parent_id":"shop"}]}\' | orca scryer container add --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'component', 'add'],
    summary: 'Author planned Scryer component nodes under a container',
    usage: 'orca scryer component add --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: [
      'The JSON input must contain a non-empty `items` array; each item needs a `parent_id`.'
    ],
    examples: [
      'echo \'{"items":[{"name":"Orders","parent_id":"api"}]}\' | orca scryer component add --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'symbol', 'add'],
    summary: 'Author planned Scryer symbol nodes under a component',
    usage: 'orca scryer symbol add --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: [
      'The JSON input must contain a non-empty `items` array; each item needs a `parent_id` and `source_file`.'
    ],
    examples: [
      'echo \'{"items":[{"name":"handleOrder","parent_id":"orders","source_file":"src/orders.ts"}]}\' | orca scryer symbol add --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'group', 'add'],
    summary: 'Author a planned Scryer group over existing sibling nodes',
    usage: 'orca scryer group add --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain a non-empty `items` array of group descriptors.'],
    examples: [
      'echo \'{"items":[{"name":"Core","parent_id":"api","member_ids":["orders","billing"]}]}\' | orca scryer group add --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'group', 'set'],
    summary: 'Replace the planned Scryer group set',
    usage: 'orca scryer group set --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain a `data` array of full group objects.'],
    examples: [
      'echo \'{"data":[{"id":"group-core","name":"Core","memberIds":["orders","billing"]}]}\' | orca scryer group set --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'group', 'update'],
    summary: 'Patch planned Scryer groups',
    usage: 'orca scryer group update --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain a non-empty `items` array of group patches.'],
    examples: [
      'echo \'{"items":[{"group_id":"group-core","name":"Core Services"}]}\' | orca scryer group update --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'group', 'delete'],
    summary: 'Delete a planned Scryer group',
    usage: 'orca scryer group delete --group-id <id> [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'group-id'],
    examples: ['orca scryer group delete --group-id group-core --json']
  },
  {
    path: ['scryer', 'source', 'update'],
    summary: 'Update Scryer source-map and boundary anchors',
    usage: 'orca scryer source update --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input carries `entries` and/or `boundaries` anchor updates.'],
    examples: [
      'echo \'{"entries":[{"target":"orders","locations":[{"pattern":"src/orders.ts"}]}]}\' | orca scryer source update --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'model', 'set'],
    summary: 'Replace the whole Scryer model (initial generation / import)',
    usage: 'orca scryer model set --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain `data` with a full Scryer 0.3 model.'],
    examples: [
      'echo \'{"data":{"version":"0.3","nodes":[],"links":[],"groups":[],"sourceMap":{},"boundaries":{}}}\' | orca scryer model set --json-input - --json'
    ]
  }
]
