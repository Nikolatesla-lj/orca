import type { ScryerOperationId } from './operation-identifiers'
import type { ScryerOperationSupport } from './operation-contracts'

// Explicit transport/UI support status per cataloged operation. This is the single
// authoring site the machine-parity gate reads through `contract.support`; it replaces
// the implicit "every operation supports all five transports" default so IPC and UI
// evidence is credible. Keyed exhaustively over ScryerOperationId for compile-time
// completeness — a new operation id will not typecheck until its support is declared.

const GENERIC_IPC_CHANNEL = 'architecture:executeScryerOperation'

// Every operation is reachable through the CLI (`SCRYER_HANDLERS`), the generic IPC
// dispatch channel, the MCP agent bridge, and the system caller. UI is declared
// per-operation below.
function machineTransports(): ScryerOperationSupport['transports'] {
  return ['cli', 'ipc', 'agent', 'system']
}

function withUi(
  transports: ScryerOperationSupport['transports']
): ScryerOperationSupport['transports'] {
  return [...transports, 'ui']
}

const CANVAS_ENTRY = 'src/renderer/src/components/architecture/useArchitectureModelController.ts'

// A write operation dispatched directly by the Architecture canvas controller.
function canvasIntegrated(): ScryerOperationSupport {
  return {
    transports: withUi(machineTransports()),
    ipc: { supported: true, channel: GENERIC_IPC_CHANNEL },
    ui: { status: 'product_integrated', surface: 'architecture-canvas', productEntry: CANVAS_ENTRY }
  }
}

// A CLI/agent/system operation with no direct Architecture canvas entry by design.
function uiWaived(reason: string): ScryerOperationSupport {
  return {
    transports: machineTransports(),
    ipc: { supported: true, channel: GENERIC_IPC_CHANNEL },
    ui: { status: 'waived', reason }
  }
}

export const SCRYER_OPERATION_SUPPORT = {
  // Read path backs the whole Architecture view through the read-view adapter.
  'scryer.model.read': {
    transports: withUi(machineTransports()),
    ipc: { supported: true, channel: GENERIC_IPC_CHANNEL },
    ui: {
      status: 'product_integrated',
      surface: 'architecture-view',
      productEntry: 'src/main/scryer/architecture-view-adapter.ts'
    }
  },
  'scryer.model.search': uiWaived('CLI/agent model search; no direct canvas entry'),
  'scryer.model.query': uiWaived('CLI/agent structural query; no direct canvas entry'),
  'scryer.rules.read': uiWaived('CLI/agent modeling-rules read; no direct canvas entry'),
  'scryer.codebase.read': uiWaived('CLI/agent codebase-context read; no direct canvas entry'),
  'scryer.model.validate': uiWaived(
    'CLI/agent validation; renderer surfaces warnings through the read path, not this op'
  ),
  'scryer.model.health': uiWaived('CLI/agent model-health read; no direct canvas entry'),
  'scryer.plan.pending': uiWaived('CLI/agent plan-diff read; no direct canvas entry'),
  'scryer.node.update': canvasIntegrated(),
  'scryer.link.add': canvasIntegrated(),
  'scryer.link.update': canvasIntegrated(),
  'scryer.link.delete': canvasIntegrated(),
  'scryer.node.set-subtree': uiWaived(
    'CLI/agent structural subtree replacement; no direct canvas entry'
  ),
  'scryer.node.delete': canvasIntegrated(),
  'scryer.node.move': uiWaived('CLI/agent node move; no direct canvas op dispatch'),
  'scryer.responsibility.move': uiWaived('CLI/agent responsibility move; no direct canvas entry'),
  'scryer.group.set': canvasIntegrated(),
  'scryer.group.update': canvasIntegrated(),
  'scryer.group.delete': canvasIntegrated(),
  'scryer.person.add': uiWaived('CLI/agent authoring; canvas add flows do not dispatch this op'),
  'scryer.system.add': uiWaived('CLI/agent authoring; canvas add flows do not dispatch this op'),
  'scryer.container.add': uiWaived('CLI/agent authoring; canvas add flows do not dispatch this op'),
  'scryer.component.add': uiWaived('CLI/agent authoring; canvas add flows do not dispatch this op'),
  'scryer.group.add': canvasIntegrated(),
  'scryer.symbol.add': canvasIntegrated(),
  'scryer.source.update': canvasIntegrated(),
  'scryer.plan.fold': uiWaived(
    'Agent edit-session completion / CLI fold; no direct canvas op dispatch'
  ),
  'scryer.model.set': uiWaived(
    'Reached via architecture:createModel IPC seeding; no direct canvas op dispatch'
  ),
  // #73 product entry: the visible "Fill with AI" run — edit-session lease before
  // agent launch, the agent's single `orca scryer container fill` through the Engine
  // seam, and the token-free Completion Gate driving the visible terminal. Proven by
  // the release-critical Electron E2E (architecture-container-fill.spec.ts), including
  // the success terminal driven through the production agent Stop-hook protocol.
  'scryer.container.fill': {
    transports: withUi(machineTransports()),
    ipc: { supported: true, channel: GENERIC_IPC_CHANNEL },
    ui: {
      status: 'product_integrated',
      surface: 'architecture-canvas',
      productEntry: 'src/renderer/src/components/architecture/useArchitectureContainerFillRun.ts'
    }
  },
  'scryer.node.descope': uiWaived('CLI/agent model correction; no direct canvas op dispatch'),
  'scryer.drift.get': uiWaived(
    'Surfaced through architecture:checkDrift IPC; no direct canvas op dispatch'
  ),
  'scryer.drift.flag': uiWaived('CLI/agent drift recording; no direct canvas op dispatch'),
  'scryer.drift.reconcile': uiWaived(
    'Surfaced through architecture:markSynced IPC; no direct canvas op dispatch'
  )
} satisfies Record<ScryerOperationId, ScryerOperationSupport>
