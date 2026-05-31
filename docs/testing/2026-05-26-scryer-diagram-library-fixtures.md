# Scryer Diagram Library Fixture Catalog

日期：2026-05-26

本文规定 Scryer Diagram Library 功能必须使用的真实测试输入。这里的 `fixture` 指测试时固定读取的样例文件，不是临时拼出来的假数据。实现任务不能只在测试里手写对象冒充 `.scry`、Mermaid source 或 cache request。

## Source

- PRD: `docs/prd/2026-05-26-scryer-diagram-library-prd.md`
- System contracts: `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`
- Implementation contracts: `docs/contracts/2026-05-26-scryer-diagram-library-implementation-contracts.md`
- Verification plan: `docs/testing/2026-05-26-scryer-diagram-library-verification.md`

## Fixture rules

- Fixtures must live under the repo test fixture directory chosen by the implementing slice. Preferred path: `src/shared/scryer/__fixtures__/diagram-library/`.
- Every task issue must name the fixture IDs it reads.
- Parser, model-store, MCP, CLI bridge, prompt, drift, and standalone compatibility tests must read real fixture files from disk.
- Component tests may use in-memory props only for UI state, but the same slice must also include the non-mocked real-path tests required below.
- Do not mutate fixture files in place. Copy them to a temporary project directory before write/reload tests.

## Required fixture catalog

| Fixture ID | Required fixture path | Purpose | Must contain | Required assertions |
|---|---|---|---|---|
| FX1 | `src/shared/scryer/__fixtures__/diagram-library/legacy-v1-no-diagrams.scry` | Old model migration | `nodes`, `edges`, at least one `flow`, no `schemaVersion`, no `diagrams`, no `diagramRefs` | `parseModelData` returns `schemaVersion: 2`, `diagrams: []`, `diagramRefs: []`; read-only open does not rewrite file. |
| FX2 | `src/shared/scryer/__fixtures__/diagram-library/valid-diagrams-and-refs.scry` | Happy-path persistence | One C4 node, one edge, one group, one flow, one nested flow step, three Mermaid diagrams, whole-diagram refs and element refs | UI/MCP mutations preserve unrelated fields and persist diagram source/refs after reload. |
| FX3 | `src/shared/scryer/__fixtures__/diagram-library/bad-diagram-refs.scry` | Validation warnings | Duplicate diagram id, duplicate ref id, ref to missing diagram, ref to missing node, ref to missing nested flow step, invalid `sourceRange`, unsafe source targets | Parser keeps first duplicate, preserves dangling refs, returns warnings with diagram/ref IDs, target details, and `parser.invalid-source-target` for unsafe source refs. |
| FX4 | `src/shared/scryer/__fixtures__/diagram-library/nested-flow-steps.scry` | Recursive flow step lookup | One flow with root steps and at least two nested `branches[].steps` levels; stable `step-*` IDs | `findFlowStep` finds nested steps by ID; delete-step cleanup removes refs for the deleted step and its nested children only. |
| FX5 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-flowchart.mmd` | Real Mermaid render | A flowchart with explicit node ids and labels | `detectDiagramKind` returns `flowchart`; `renderDiagram` returns sanitized SVG; `extractRenderedElements` returns stable keys for bindable nodes. |
| FX6 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-sequence.mmd` | Real Mermaid render | A sequence diagram with at least three participants and two messages | Real adapter renders without using `beautiful-mermaid`; diagnostics are empty or warnings only. |
| FX7 | `src/shared/scryer/__fixtures__/diagram-library/invalid-mermaid-syntax.mmd` | Diagnostic behavior | Mermaid source with a deliberate syntax error near a known line | Renderer returns `ok: false`; UI shows message and line/column when available; source text is not overwritten. |
| FX8 | `src/shared/scryer/__fixtures__/diagram-library/malicious-cache-requests.json` | Cache path safety | Requests with `diagramId` path traversal, invalid `cacheKey`, oversized marker payload, and valid control request | Cache IPC rejects unsafe requests and writes no files outside `.scryer/cache/diagrams`. |
| FX9 | `src/shared/scryer/__fixtures__/diagram-library/many-diagrams-for-prompt.scry` | Prompt compactness | At least 20 diagrams with realistic source lengths and refs | Default prompt serialization omits full sources, includes `sourceOmitted: true` and `sourceHash`, and uses `get_diagram` for full source. |
| FX10 | `src/shared/scryer/__fixtures__/diagram-library/standalone-roundtrip-v2.scry` | Standalone compatibility | `schemaVersion: 2`, diagrams, refs, sourceMap, groups, flows, and at least one unknown compatible top-level field | Orca -> standalone open/save -> Orca reopen preserves diagram fields and unknown compatible fields. |
| FX11 | `src/shared/scryer/__fixtures__/diagram-library/large-mermaid-flowchart-200.mmd` | Performance baseline | One Mermaid flowchart with at least 200 explicit node ids and realistic labels | Render path stays responsive under the verification threshold; S7B thumbnail batching uses the shared render queue. |
| FX12 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-class.mmd` | Real Mermaid render | A class diagram with at least three classes, one inheritance relation, and one association | `detectDiagramKind` returns `class`; `renderDiagram` returns sanitized SVG through the default adapter. |
| FX13 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-state.mmd` | Real Mermaid render | A state diagram with an initial state, at least three named states, and two transitions | `detectDiagramKind` returns `state`; `renderDiagram` returns sanitized SVG through the default adapter. |
| FX14 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-er.mmd` | Real Mermaid render | An ER diagram with at least three entities, attributes, and two relationships | `detectDiagramKind` returns `er`; `renderDiagram` returns sanitized SVG through the default adapter. |
| FX15 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-architecture-beta.mmd` | Adapter support matrix | An `architecture-beta` diagram with at least three services/components and two relationships | `detectDiagramKind` returns `architecture`; adapter either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter version. |
| FX16 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-gitgraph.mmd` | Adapter support matrix | A `gitGraph` diagram with at least three commits and one branch/merge | `detectDiagramKind` returns `gitGraph`; adapter either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter version. |
| FX17 | `src/shared/scryer/__fixtures__/diagram-library/valid-mermaid-c4context.mmd` | Adapter support matrix | A `C4Context` diagram with at least one person, one system, and one relationship | `detectDiagramKind` returns `c4`; adapter either renders sanitized SVG or returns `renderer.unsupported-kind` with directive and adapter version. |

## Minimum fixture content rules

### FX1 legacy v1

- Must not include `schemaVersion`, `diagrams`, or `diagramRefs`.
- Must include at least one existing field that this feature must not delete, such as `startingLevel`, `sourceMap`, `projectPath`, `refPositions`, `groups`, or `flows`.
- Parser tests must compare the file bytes before and after a read-only parse to prove no write happened.

### FX3 bad refs

Required bad cases:

- `duplicateDiagramId`: two diagrams with the same `id`.
- `duplicateRefId`: two refs with the same `id`.
- `missingDiagram`: `diagramId` does not exist.
- `missingNode`: target node id does not exist.
- `missingNestedStep`: target `{ type: 'flowStep' }` cannot be found by recursive search.
- `invalidSourceRange`: line is less than 1, column is less than 1, or end precedes start.
- `invalidSourceTargetAbsolute`: source target pattern is an absolute path.
- `invalidSourceTargetTraversal`: source target pattern contains `..` after POSIX normalization.
- `invalidSourceTargetScheme`: source target pattern uses a URL scheme such as `file://` or `https://`.
- `invalidSourceTargetGlobEscape`: syntax-level glob traversal is rejected by the pure helper, or runtime glob/symlink expansion would resolve outside the authorized project root.
- `invalidUpdatedAt`: diagram has an `updatedAt` value that is not a valid ISO 8601 UTC timestamp.

### FX8 cache requests

Required request names:

- `validSvgWrite`
- `unauthorizedProjectPath`
- `pathTraversalDiagramId`
- `invalidCacheKey`
- `emptyWritePayload`
- `payloadProfileMismatch`
- `oversizedSvg`
- `oversizedPngDataUrl`
- `corruptCacheRead`

The oversized payload may be generated by the test from a size marker in the fixture. It must still use a real temporary project path and the real cache service.

### FX11 large Mermaid flowchart

- Must contain at least 200 explicit node ids.
- Must contain enough edges to exercise normal layout, not 200 isolated nodes.
- Labels must use realistic short text so performance evidence reflects normal architecture diagrams.
- Tests may generate thumbnail batches by referencing this same fixture multiple times, but the source fixture itself must be read from disk.

### FX12-FX17 required Mermaid kind fixtures

- FX12, FX13, FX14, FX15, FX16, and FX17 must be real `.mmd` files read from disk by adapter tests.
- FX12-FX14 are core supported render fixtures and must render sanitized SVG.
- FX15-FX17 are support-matrix fixtures. Tests must not inline these Mermaid strings. The default adapter must either render them or return a structured `renderer.unsupported-kind` diagnostic; either result is acceptable only when the support status is asserted explicitly.
- These fixtures close the render support matrix for core required kinds (`flowchart`, `sequence`, `class`, `state`, `er`) and explicit non-core support checks (`architecture-beta`, `gitGraph`, `C4Context`).
- Tests must not replace these fixtures with Mermaid strings embedded inside the test file.
- If the current Mermaid package cannot render one of the five core required kinds, the implementing slice must stay incomplete until support is added or the contract is changed. For FX15-FX17, unsupported is allowed only as a structured `renderer.unsupported-kind` result with test evidence.

## Fixture-to-slice mapping

| Slice | Required fixtures |
|---|---|
| F1A | FX1, FX3, FX4 |
| F1B | FX5, FX6, FX7, FX12, FX13, FX14, FX15, FX16, FX17 |
| S1A | FX1, FX2 |
| S1B | FX2, FX9 |
| S2 | FX2, FX5, FX6, FX7, FX11, FX12, FX13, FX14, FX15, FX16, FX17 |
| S3 | FX2, FX3, FX4 |
| S4 | FX2, FX3, FX5 |
| S5 | FX2, FX3 |
| S6 | FX2, FX9 |
| S7A | FX5, FX8 |
| S7B | FX5, FX8, FX11 |
| S8 | FX10 |
| S9 | FX1-FX17 |

## Anti-fake-data rule

If a test constructs a model object inline, that test can only prove local logic. It cannot be the completion evidence for migration, persistence, MCP, CLI bridge, cache path safety, prompt compactness, drift, or standalone compatibility. Those completion checks must read the fixture files above or copies of them from a temporary project directory.
