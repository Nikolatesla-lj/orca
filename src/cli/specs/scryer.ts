import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const SCRYER_FLAGS = [...GLOBAL_FLAGS, 'project', 'lease-token']

export const SCRYER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['scryer', 'model', 'read'],
    summary: 'Read a Scryer 0.3 model through the Native Scryer Engine',
    usage:
      'orca scryer model read [--project <path>] [--layer plan|committed] [--view overview|subtree|full] [--node <id>] [--full] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'layer', 'node', 'view', 'full'],
    examples: ['orca scryer model read --json', 'orca scryer model read --full --json']
  },
  {
    path: ['scryer', 'model', 'search'],
    summary: 'Search Scryer model nodes through the Native Scryer Engine',
    usage:
      'orca scryer model search --query <text> [--kind person|system|container|component|symbol] [--project <path>] [--layer plan|committed] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'query', 'kind', 'layer'],
    examples: ['orca scryer model search --query auth --json']
  },
  {
    path: ['scryer', 'model', 'query'],
    summary: 'Query Scryer model nodes by structural predicates',
    usage: 'orca scryer model query --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain `where` or `conditions`.'],
    examples: [
      'echo \'{"where":[{"field":"kind","op":"eq","value":"component"}]}\' | orca scryer model query --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'rules', 'read'],
    summary: 'Read Scryer modeling rules as structured payloads',
    usage: 'orca scryer rules read [--topic <text>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'topic'],
    examples: ['orca scryer rules read --json', 'orca scryer rules read --topic links --json']
  },
  {
    path: ['scryer', 'codebase', 'read'],
    summary: 'Read a bounded annotated project tree for modeling context',
    usage:
      'orca scryer codebase read [--project <path>] [--path <path>] [--max-depth <n>] [--max-entries <n>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'path', 'max-depth', 'max-entries'],
    examples: ['orca scryer codebase read --project . --json']
  },
  {
    path: ['scryer', 'model', 'validate'],
    summary: 'Validate a Scryer 0.3 model',
    usage: 'orca scryer model validate [--project <path>] [--layer plan|committed] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'layer'],
    examples: ['orca scryer model validate --project . --json']
  },
  {
    path: ['scryer', 'model', 'health'],
    summary: 'Report Scryer model health, anchor coverage, and drift observations',
    usage: 'orca scryer model health [--node-id <id>] [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'node-id'],
    examples: ['orca scryer model health --json', 'orca scryer model health --node-id api --json']
  },
  {
    path: ['scryer', 'drift', 'get'],
    summary: 'Detect Scryer code-to-model drift scopes since the last reconcile',
    usage: 'orca scryer drift get [--project <path>] [--json]',
    allowedFlags: SCRYER_FLAGS,
    examples: ['orca scryer drift get --json']
  },
  {
    path: ['scryer', 'drift', 'flag'],
    summary: 'Record reviewed Scryer drift findings into planned state',
    usage: 'orca scryer drift flag --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'node-id'],
    notes: [
      'The JSON input must contain `node_id` and at least one finding array (e.g. `undescribed`, `new_nodes`, `stale`).'
    ],
    examples: [
      'echo \'{"node_id":"api","undescribed":[{"node_id":"orders","statement":"Cancels stale orders","source_file":"src/orders.ts"}]}\' | orca scryer drift flag --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'drift', 'reconcile'],
    summary: 'Advance the Scryer drift reconcile baseline after review',
    usage: 'orca scryer drift reconcile [--project <path>] [--json]',
    allowedFlags: SCRYER_FLAGS,
    examples: ['orca scryer drift reconcile --json']
  },
  {
    path: ['scryer', 'node', 'update'],
    summary: 'Patch planned Scryer nodes',
    usage: 'orca scryer node update --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain the engine field `nodes`.'],
    examples: [
      'echo \'{"nodes":[{"node_id":"api","name":"API"}]}\' | orca scryer node update --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'node', 'set-subtree'],
    summary: 'Replace descendants under an existing planned Scryer node',
    usage: 'orca scryer node set-subtree --node-id <id> --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'node-id'],
    notes: ['The JSON input must contain `data` or top-level `nodes` and optional `links`.'],
    examples: [
      'echo \'{"data":{"nodes":[]}}\' | orca scryer node set-subtree --node-id api --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'node', 'move'],
    summary: 'Move planned Scryer node subtrees without changing identity',
    usage:
      'orca scryer node move (--json-input - | --node-id <id> [--new-parent-id <id>]) [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'node-id', 'new-parent-id'],
    examples: ['orca scryer node move --node-id api --new-parent-id platform --json']
  },
  {
    path: ['scryer', 'responsibility', 'move'],
    summary: 'Move planned node-owned Scryer responsibilities between nodes',
    usage:
      'orca scryer responsibility move (--json-input - | --responsibility-id <id> --from-node-id <id> --to-node-id <id>) [--project <path>] [--json]',
    allowedFlags: [
      ...SCRYER_FLAGS,
      'json-input',
      'responsibility-id',
      'from-node-id',
      'to-node-id'
    ],
    examples: [
      'orca scryer responsibility move --responsibility-id resp-api --from-node-id api --to-node-id web --json'
    ]
  },
  {
    path: ['scryer', 'node', 'descope'],
    summary: 'Remove planned model scope while leaving code semantically unchanged',
    usage: 'orca scryer node descope --node-ids <id,id> [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'node-ids'],
    examples: ['orca scryer node descope --node-ids api --json']
  },
  {
    path: ['scryer', 'link', 'add'],
    summary: 'Add planned Scryer links',
    usage:
      'orca scryer link add (--json-input - | --src <id> --dst <id> --label <text>) [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'src', 'dst', 'label', 'method'],
    examples: ['orca scryer link add --src web --dst api --label calls --json']
  },
  {
    path: ['scryer', 'link', 'delete'],
    summary: 'Delete planned Scryer links',
    usage: 'orca scryer link delete --link-ids <id,id> [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'link-ids'],
    examples: ['orca scryer link delete --link-ids link-web-api --json']
  },
  {
    path: ['scryer', 'container', 'fill'],
    summary: 'Atomically generate an empty Scryer container subtree from code',
    usage: 'orca scryer container fill --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: [
      'The JSON input must contain `container_id` and a non-empty `components` array; optional `links` and `groups`.'
    ],
    examples: [
      'echo \'{"container_id":"api","components":[{"key":"orders","name":"Orders","symbols":[{"key":"h","name":"handleOrder","source_file":"src/orders.ts"}]}]}\' | orca scryer container fill --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'link', 'update'],
    summary: 'Update planned Scryer link labels or methods',
    usage: 'orca scryer link update --json-input - [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input'],
    notes: ['The JSON input must contain a non-empty `links` array of `{ link_id, ... }` patches.'],
    examples: [
      'echo \'{"links":[{"link_id":"link-web-api","label":"calls"}]}\' | orca scryer link update --json-input - --json'
    ]
  },
  {
    path: ['scryer', 'node', 'delete'],
    summary: 'Delete planned Scryer nodes and their subtrees',
    usage: 'orca scryer node delete --node-ids <id,id> [--project <path>] [--json]',
    allowedFlags: [...SCRYER_FLAGS, 'json-input', 'node-ids'],
    examples: ['orca scryer node delete --node-ids orders --json']
  },
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
  },
  {
    path: ['scryer', 'plan', 'pending'],
    summary: 'Read pending Scryer plan work',
    usage: 'orca scryer plan pending [--project <path>] [--json]',
    allowedFlags: SCRYER_FLAGS,
    examples: ['orca scryer plan pending --json']
  },
  {
    path: ['scryer', 'plan', 'fold'],
    summary: 'Fold planned Scryer work into committed state',
    usage:
      'orca scryer plan fold --node-id <id> [--responsibility-ids <id,id>] [--link-ids <id,id>] [--all] [--project <path>] [--json]',
    allowedFlags: [
      ...SCRYER_FLAGS,
      'json-input',
      'node-id',
      'responsibility-ids',
      'property-labels',
      'link-ids',
      'all'
    ],
    examples: ['orca scryer plan fold --node-id api --responsibility-ids resp-1 --json']
  }
]
