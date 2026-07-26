import { join } from 'node:path'
import { ALL_SCRYER_OPERATION_IDS, createDefaultScryerOperationCatalog } from './catalog'
import {
  discoverCliHandlerKeys,
  discoverCliSpecPaths,
  discoverOperationCallSites,
  discoverParityGoldenOps
} from './machine-parity-discovery'
import type { MachineParityInputs } from './machine-parity-contracts'

// Assembles the real, statically-discovered evidence indices the machine-parity gate
// evaluates against. Rows still derive from the catalog contracts; these indices only
// supply the adapter/call-site/golden evidence for each row.
export async function collectDefaultMachineParityInputs(
  cwd: string = process.cwd()
): Promise<MachineParityInputs> {
  const catalog = createDefaultScryerOperationCatalog()
  const srcRoot = join(cwd, 'src')
  const engineFixtures = join(srcRoot, 'main/scryer/engine/__fixtures__')
  return {
    contracts: catalog.listOperationContracts(),
    expectedOperationIds: ALL_SCRYER_OPERATION_IDS,
    cliHandlerKeys: discoverCliHandlerKeys(join(srcRoot, 'cli/handlers/scryer.ts')),
    cliSpecPaths: discoverCliSpecPaths([
      join(srcRoot, 'cli/specs/scryer.ts'),
      join(srcRoot, 'cli/specs/scryer-authoring-command-specs.ts')
    ]),
    callSiteOps: discoverOperationCallSites(srcRoot, ALL_SCRYER_OPERATION_IDS),
    goldenOps: await discoverParityGoldenOps([
      join(engineFixtures, 'local-regression'),
      join(engineFixtures, 'upstream-parity')
    ])
  }
}
