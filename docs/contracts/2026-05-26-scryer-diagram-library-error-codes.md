# Scryer Diagram Library Error Code Matrix

日期：2026-05-26

本文规定 parser、renderer、controller、cache IPC 和 MCP diagram tools 的统一错误码。错误码用于测试断言、PR evidence 和 MCP diagram-tool failure 的必填 `data.code`。用户界面可以显示更友好的中文文案，但不能丢失结构化错误码。

## Source

- PRD: `docs/prd/2026-05-26-scryer-diagram-library-prd.md`
- System contracts: `docs/contracts/2026-05-26-scryer-diagram-library-contracts.md`
- Implementation contracts: `docs/contracts/2026-05-26-scryer-diagram-library-implementation-contracts.md`
- Fixture catalog: `docs/testing/2026-05-26-scryer-diagram-library-fixtures.md`

## Code format

- Canonical format: `<area>.<reason>`.
- `area` values: `parser`, `renderer`, `controller`, `cache`, `mcp`, `bridge`, `standalone`.
- Codes are stable public contract values. Do not rename them without updating tests, task issues, PR evidence, and this document in the same PR.
- Validation warnings may use the same codes as errors with `severity: 'warning'`.
- MCP validation failures for diagram tools must return `ScryerToolResult` with `{ ok: false, content, data: { code, details? } }`. JSON-RPC transport errors are only for bridge/protocol failures before a Scryer tool runs.

## Parser and model validation codes

| Code | Trigger | Required details | Required fixture/test |
|---|---|---|---|
| `parser.invalid-diagram` | Diagram field has wrong type, empty id/name/source, or unsupported notation/kind. | `diagramId` when available, field name. | FX3 parser warning test. |
| `parser.duplicate-diagram-id` | More than one valid diagram has the same id. | duplicate id, kept index, dropped index. | FX3 parser warning test. |
| `parser.duplicate-ref-id` | More than one valid diagramRef has the same id. | duplicate id, kept index, dropped index. | FX3 parser warning test. |
| `parser.missing-diagram` | Ref points to a diagram id that does not exist. | `diagramRefId`, missing `diagramId`. | FX3 parser warning test. |
| `parser.missing-target` | Ref target node/edge/group/flow is missing from the model. Source file existence is not checked by parser. | `diagramRefId`, target type, target id. | FX3 parser warning test. |
| `parser.missing-flow-step` | Ref target flow exists but nested flow step id is not found by recursive search. | `diagramRefId`, `flowId`, `stepId`. | FX3 and FX4 nested step tests. |
| `parser.invalid-source-range` | `sourceRange` has line/column below 1 or end before start. | `diagramRefId`, invalid fields. | FX3 parser warning test. |
| `parser.invalid-source-target` | Source target pattern is empty, absolute, contains unsafe syntax, or uses unsupported glob syntax. Parser never opens files or expands globs. | `diagramRefId`, rejected pattern, reason. | FX3 parser warning test plus S4 source target safety test. |
| `parser.invalid-updated-at` | `Diagram.updatedAt` is present but is not a valid ISO 8601 UTC timestamp string. | `diagramId`, rejected value. | FX3 parser warning test. |
| `parser.schema-unsupported` | File declares a future schema version the current app cannot safely write. | detected version, supported version. | Future compatibility test when introduced. |

## Renderer codes

| Code | Trigger | Required details | Required fixture/test |
|---|---|---|---|
| `renderer.invalid-source` | Mermaid parser/render fails for user source. | message, line/column when Mermaid provides it, `sourceHash`. | FX7 adapter diagnostic test and UI diagnostic evidence. |
| `renderer.unsupported-kind` | The first meaningful Mermaid directive is not supported by the active adapter. | detected kind, directive, adapter name/version. | Adapter support matrix test. |
| `renderer.kind-conflict` | `Diagram.kind` differs from the kind detected from the first meaningful Mermaid directive. | stored kind, detected kind, directive, diagram id. | Controller/render test. |
| `renderer.sanitization-failed` | SVG cannot be sanitized into safe output. | diagram id, sourceHash. | SVG sanitization negative test. |
| `renderer.queue-failed` | Shared Mermaid render queue rejects or times out. | diagram id, sourceHash, queue state if available. | Batch render queue test. |
| `renderer.element-unbindable` | A rendered element has no stable semantic key. | diagram id, label/source range if available. | Element extraction test; warning only. |

## Controller codes

| Code | Trigger | Required details | Required fixture/test |
|---|---|---|---|
| `controller.empty-name` | Create or rename receives a blank diagram name after trimming. | attempted name, operation. | S1 controller negative test. |
| `controller.empty-source` | Create or save receives empty source. | diagram id when available, operation. | S1 controller negative test. |
| `controller.diagram-not-found` | Mutation references a diagram id not present in the current model. | diagram id, operation. | Controller negative test. |
| `controller.ref-not-found` | Delete/update references a ref id not present in the current model. | ref ids, operation. | Ref controller negative test. |
| `controller.duplicate-id` | Mutation would create a duplicate diagram or ref id. | duplicate id, entity type. | Controller duplicate-id test. |
| `controller.missing-target` | UI ref creation target no longer exists. | target type and id/path. | S3/S3A target-deleted test. |
| `controller.invalid-source-target` | UI source target pattern is unsafe or outside the authorized project root. | rejected pattern, reason. | S3/S4 source target safety test. |
| `controller.source-open-failed` | Source target pattern passed validation but the target file could not be opened. | rejected pattern, normalized path or glob, safe failure reason. | S4 real source open failure test. |
| `controller.missing-role` | UI ref creation did not provide an explicit role. | diagram id, target. | S3/S3A missing-role test. |
| `controller.other-note-required` | `role: 'other'` was selected without `note`. | diagram id, target. | S3 controller negative test. |
| `controller.invalid-element-key` | Element-level ref uses an element key not returned by the adapter for the current render. | diagram id, elementKey. | S4 controller negative test. |
| `controller.export-failed` | PNG export save dialog or file write fails after the user chooses a destination. Cancellation is not an error. | diagram id, destination path if safe, failure reason. | S7B export failure test. |
| `controller.persist-failed` | Validation passed but model write failed. | operation, model name/path, write error. | Controller/model-store failure test. |
| `controller.revision-conflict` | Save failed because the model changed on disk. | operation, base/current revision when safe. | Dirty draft conflict test. |

## Cache IPC codes

| Code | Trigger | Required details | Required fixture/test |
|---|---|---|---|
| `cache.invalid-diagram-id` | `diagramId` does not match `[A-Za-z0-9_-]{1,120}`. | rejected diagram id. | FX8 path traversal test. |
| `cache.invalid-cache-key` | `cacheKey` is not `sha256:<64 lowercase hex>`. | rejected cacheKey. | FX8 invalid cache key test. |
| `cache.unauthorized-project` | `projectPath` does not pass `assertAuthorizedArchitectureProjectPath(projectPath, store)` backed by `filesystem-auth.ts`. | rejected projectPath, active workspace id/path if safe to log. | Cache IPC authorization test. |
| `cache.empty-payload` | Write request has neither `svg` nor `pngDataUrl`. | diagram id, cacheKey. | Cache write validation test. |
| `cache.payload-too-large` | SVG or PNG data URL exceeds size limit. | payload kind, byte length, limit. | FX8 oversized payload tests. |
| `cache.payload-profile-mismatch` | Request payload does not match `outputProfile`, such as `pngDataUrl` for `review` or `svg` for `export`. | outputProfile, provided payload keys. | Cache outputProfile validation test. |
| `cache.path-outside-cache` | Resolved cache path escapes `.scryer/cache/diagrams`. | resolved path, cache root. | FX8 path containment test. |
| `cache.write-failed` | Safe request cannot be written. | diagram id, cacheKey, filesystem error message. | Cache write failure test. |
| `cache.read-miss` | Cache file is missing or corrupt and can be rebuilt from persisted source. | diagram id, cacheKey, corrupt file path if available. | FX8 corrupt read test. |
| `cache.clear-failed` | Safe clear request cannot remove cache files. | modelName, diagramId if provided, filesystem error. | Cache clear failure test. |

## MCP and CLI bridge codes

| Code | Trigger | Required details | Required fixture/test |
|---|---|---|---|
| `mcp.invalid-json` | `data` argument is not parseable JSON. | tool name, JSON parse message. | MCP negative test. |
| `mcp.validation-failed` | Parsed payload violates diagram/ref contract. | tool name, validation codes when available. | FX3 MCP negative tests. |
| `mcp.diagram-not-found` | Tool requires an existing diagram id and it is absent. | tool name, diagram id. | `get_diagram` / `delete_diagram` failure tests. |
| `mcp.ref-not-found` | Delete/update references a ref id that does not exist. | tool name, ref ids. | `update_diagram_refs delete` failure test. |
| `mcp.target-not-found` | Ref target cannot be validated. | tool name, target type and id/path. | FX3 MCP negative tests. |
| `mcp.duplicate-id` | Payload contains duplicate diagram or ref ids. | tool name, duplicate ids. | FX3 MCP negative tests. |
| `mcp.mode-argument-missing` | Mode requires `data`, `diagram_id`, or `ref_ids` and it is missing. | tool name, mode, missing argument. | Mode matrix tests. |
| `mcp.persist-failed` | Handler validation passed but model write failed. | tool name, model name/path, write error. | Model-store failure test. |
| `bridge.tool-not-exposed` | A diagram tool exists in handlers but is missing from external CLI `tools/list`. | tool name. | CLI bridge `tools/list` test. |
| `bridge.schema-mismatch` | CLI bridge input schema differs from contract or allows extra properties. | tool name, schema diff summary. | CLI bridge schema test. |

## Standalone compatibility codes

| Code | Trigger | Required details | Required fixture/test |
|---|---|---|---|
| `standalone.save-blocked` | Standalone Scryer detects a v2 `.scry` file that it cannot safely preserve on save. | schemaVersion, missing field or unsupported preservation reason. | FX10 standalone negative test. |

## Error response shapes

### Parser warning shape

Parser warnings must use the existing `ModelValidationWarning` shape when possible and include at least:

```ts
{
  code: 'parser.missing-diagram',
  message: string,
  diagramId?: string,
  diagramRefId?: string,
  target?: DiagramRefTarget
}
```

If the existing warning type cannot accept `code`, the implementing slice must extend it additively. It must not replace existing warning fields used by current callers.

### Renderer diagnostic shape

Renderer failures use `DiagramDiagnostic` from the system contract:

```ts
{
  severity: 'error',
  code: 'renderer.invalid-source',
  message: string,
  line?: number,
  column?: number
}
```

If the current `DiagramDiagnostic` type lacks `code`, the implementing slice must add required `code: DiagramErrorCode` before renderer work starts. Optional diagnostic codes are not allowed for this feature because tests and agents need stable failure categories.

### Cache IPC failure shape

Cache IPC must return structured failures instead of throwing for validation errors:

```ts
type DiagramCacheFailure = {
  ok: false
  code: DiagramCacheErrorCode
  message: string
  details?: unknown
}
```

Read miss is not a fatal error. It must return `{ ok: true, hit: false, outputProfile, code: 'cache.read-miss' }`.

### MCP failure shape

MCP tool validation failures must return:

```ts
{
  ok: false,
  content: string,
  data: {
    code: DiagramErrorCode,
    details?: unknown
  }
}
```

The `content` text must stay short and understandable for users; the `data.code` is for automated tests and agents.
