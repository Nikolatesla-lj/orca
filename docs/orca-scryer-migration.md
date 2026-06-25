# orca-scryer 迁移计划

生成时间：2026-05-10

Document boundary: this is a linked migration-plan asset. It tracks implementation
scope, status, risks, and execution order. The compact planning authority is
[orca-scryer-decision-map.md](./orca-scryer-decision-map.md); decision records
live in [docs/adr](./adr/); glossary terms live in [../CONTEXT.md](../CONTEXT.md).

## 当前工作区

- 目标工作区：`/home/ljian/wspace/orca-scryer`
- 目标项目：`orca/`，来源仓库 `https://github.com/stablyai/orca`
- 功能来源：`scryer/`，来源仓库 `https://github.com/aklos/scryer`
- GitNexus 索引结果：
  - `scryer`：3,011 个节点，4,681 条关系，61 个功能区，175 条流程
  - 当前 workspace 的 `orca`：29,012 个节点，53,419 条关系，1,144 个功能区，300 条流程

## 总结结论

建议不要把 Scryer 整个 Tauri 应用直接塞进 Orca。合理做法是：

1. 保留 Scryer 的核心模型、画布、C4 层级、source map、Scryer operation 语义、任务排序和 drift sync 逻辑。
2. 舍弃 Scryer 的 Tauri 外壳、独立桌面设置页、独立 AI provider 设置、独立 Agent 启动方式。
3. 把后端能力改写到 Orca 的 Electron/Node IPC 和 Orca 自己的 agent/tab 体系里。
4. 在 Orca 的 `New tab` 菜单里新增 `New Architecture`，打开一个原生 Orca tab，而不是外部窗口或 webview。

AI provider 边界已经明确：不迁移 Scryer 的 `scryer-suggest` provider 设置，不在 Orca 里再做一套 OpenAI/Anthropic/Ollama 配置。架构图的 AI 能力走 Orca 已有 agent 体系，例如 Codex/Claude 终端和 Orca agent hooks；Scryer 迁移部分只提供模型、Native TS operation layer、Orca-native `orca scryer ...` CLI、任务提示、source map 和 drift sync 所需的数据接口。

源码边界：Scryer 当前是 `FSL-1.1-MIT`，Orca 是 `MIT`。本迁移不直接复制 upstream Scryer 实现源码进 Orca 产品运行时；采用“迁移功能语义并在 Orca 内重新实现代码”的路径。upstream Scryer 仍作为行为、schema、状态转换和 parity test 参考。

第二阶段按“前端交互 -> 前端模型状态 -> IPC/后端持久化 -> CLI/agent 外部改写 -> 前端重新理解状态”的完整链路迁移，而不是只补 UI 按钮。详细 UML 对比、时序图、状态机和细粒度完成情况见：

- `docs/orca-scryer-uml-gap-analysis.md`

## Scryer 功能链

### 必须继承

- Scryer 0.3 模型数据：
  - `version: "0.3"`
  - `nodes`
  - `links`
  - `groups`
  - `sourceMap`，键为 responsibility id 或 schema node id
  - `boundaries`，键为 node id
  - committed/planned 双层模型
- 视觉编辑：
  - `C4Canvas`
  - `C4Node`
  - `RelationshipEdge`
  - `CodeLevelRack`
  - `ContextPanel`
  - `FlowScriptView`
  - `GroupsView`
  - `SyncBar`
- 模型存储：
  - 项目内 `.scryer/model.scry`
  - `.scryer/planned.scry`
  - `.scryer/model.baseline.scry`
  - `.scryer/.sync`
  - `.scryer/.lock`
  - `.scryer/history.jsonl`
  - `.scryer/.anchors.json`
  - `.scryer/.build_edges.json`
  - 文件监听和自动保存
- Scryer operation 语义，迁移到 Orca CLI：
  - `read_model`
  - `search_model`
  - `query_model`
  - `get_pending`
  - `get_drift`
  - `get_health`
  - `update_nodes`
  - `mark_implemented`
  - `move_nodes`
  - `set_model`
  - `set_node`
  - `delete_nodes`
  - `add_links`
  - `update_links`
  - `delete_links`
  - `set_groups`
  - `update_group`
  - `delete_group`
  - `update_source_map`
  - `validate_model`
  - `get_rules`
  - `read_codebase`
  - `add_person`
  - `add_system`
  - `add_container`
  - `add_component`
  - `add_group`
  - `add_symbol`
  - `flag_drift`
  - `reconcile_drift`
  - `fill_container`
- 任务排序逻辑：
  - `get_pending` 基于 committed/planned diff 生成待实现项
  - `mark_implemented` 折叠 plan 到 committed
  - vagrant/stale flags 表示 drift verdict 前状态
  - responsibilities/properties/directives 表达模型责任
- drift sync：
  - boundaries 决定 drift scope
  - sourceMap anchors 和 `.anchors.json` 记录锚点指纹
  - `.sync` 记录 reconcile anchor
  - drift read 只报告需要复查的 scope，semantic verdict 由 `flag_drift` 写入 plan

### 需要改写

- Scryer 的 Tauri `invoke(...)` 要改成 Orca 的 preload API 和 Electron IPC。
- Rust 的 `scryer-core` 文件读写、drift、scan、rules 逻辑要改写成 TypeScript/Node 模块；ADR 0007 已决定不走 packaged Rust sidecar 产品路径。
- `scryer-mcp` 的工具语义要迁移成 Orca-native CLI `orca scryer <noun> <verb>` 和同源 Native TS operation layer，不保留 MCP server 作为产品路径。
- `scryer-acp` 里的 agent spawn 要接 Orca 现有的 agent/terminal 启动流程，而不是自己调用 `claude -p` 或 `codex exec`。
- Scryer 的 UI 主题和基础按钮组件要适配 Orca 现有 design system。

### 第一阶段舍弃

- Tauri app shell：`src-tauri/`
- Scryer 独立设置页：`SettingsPanel`
- Scryer 独立 AI Advisor provider 设置：`scryer-suggest`
- Scryer 独立安装 MCP 配置流程：`setup_mcp_integration`
- Scryer docs app、templates 的完整模板系统

这些不是永远不要，而是不应进入第一轮迁移。先把“架构图 tab 能打开、能编辑、能保存、agent 能读写”跑通。

## Orca 接入点

GitNexus 和源码确认的关键位置：

- `src/renderer/src/components/tab-bar/TabBar.tsx`
  - 截图中的 `New Terminal / New Browser Tab / New Markdown` 菜单在这里。
- `src/renderer/src/components/tab-group/useTabGroupWorkspaceModel.ts`
  - tab 的创建、激活、关闭、分组动作在这里汇总。
- `src/renderer/src/components/tab-group/TabGroupPanel.tsx`
  - active tab 的内容渲染在这里分发。
- `src/shared/types.ts`
  - `TabContentType` 和 `WorkspaceVisibleTabType` 需要新增架构图类型。
- `src/shared/workspace-session-schema.ts`
  - 会话恢复 schema 需要认识新 tab。
- `src/renderer/src/lib/workspace-session.ts`
  - 需要持久化架构图 tab。
- `src/renderer/src/store/slices/tabs.ts`
  - active surface 推导、close、reconcile 需要支持新类型。

## 目标功能边界

第一轮目标：

- Orca 的 `+` 菜单新增 `New Architecture`。
- 点击后打开一个架构图 tab。
- 架构图 tab 绑定当前 worktree。
- 默认使用当前项目下 `.scryer/model.scry`。
- 如果文件不存在，引导创建 0.3 空模型。
- 如果文件存在但不是 `version: "0.3"`，显示 upstream 一致的 model incompatibility 错误，不自动迁移。
- 可以编辑 Scryer 0.3 节点和 links。
- 可以保存到 `.scryer/model.scry`。
- 可以通过 Orca-native `orca scryer ...` CLI 让 agent 读取和修改模型。
- 修改模型后 Orca tab 内实时刷新。
- source map 可以映射到 Orca 当前项目文件。
- drift sync 能提示“代码和架构图不一致”。

暂不做：

- 独立模板市场
- 多 provider AI advisor
- 外部 Scryer 桌面 app 联动
- 正常打开时自动迁移 pre-0.3 `.scry` 模型
- 和 Scryer 上游完全保持 UI 一致

## 逐项迁移清单

### 0. 准备和风险确认

- [x] 创建 workspace：`/home/ljian/wspace/orca-scryer`
- [x] 克隆 Orca 和 Scryer
- [x] 用 GitNexus 索引两个仓库
- [x] 定位 Orca new tab 菜单和 tab 模型
- [x] 定位 Scryer 模型、画布、MCP、drift、agent sync 逻辑
- [x] 明确源码/许可证处理方式：迁移功能语义并重新实现 Orca-owned 代码，不直接复制 upstream Scryer 实现源码进产品运行时
- [x] 决定后端路线：TypeScript/Node 原生实现，不走 Rust sidecar

已接受路线：TypeScript/Node 原生实现。原因是 Orca 已经是 Electron/Node 应用，走同一套 IPC、测试和打包更稳，并且当前迁移代码可继续演进为 Scryer 0.3 engine。

### 1. 新增 Orca 原生架构图 tab 壳

- [x] `src/shared/types.ts`
  - `TabContentType` 增加 `architecture`
  - `WorkspaceVisibleTabType` 增加 `architecture`
  - 新增 `ArchitectureWorkspace` 类型
- [x] `src/shared/workspace-session-schema.ts`
  - schema 接受 `architecture`
  - 持久化架构图 tab 的轻量状态
- [x] `src/renderer/src/store/slices/architecture.ts`
  - 新增 architecture slice
  - 管理 `architectureTabsByWorktree`
  - 管理 `activeArchitectureTabIdByWorktree`
  - 提供 `createArchitectureTab`
  - 提供 `closeArchitectureTab`
  - 提供 `setActiveArchitectureTab`
- [x] `src/renderer/src/store/types.ts`
  - 把 `ArchitectureSlice` 合并进 `AppState`
- [x] `src/renderer/src/store/index.ts`
  - 注册 `createArchitectureSlice`
- [x] `src/renderer/src/components/tab-bar/TabBar.tsx`
  - 增加架构图 tab 渲染类型
  - `+` 菜单增加 `New Architecture`
  - 使用图形相关 lucide icon，例如 `Network`
- [x] `src/renderer/src/components/tab-group/useTabGroupWorkspaceModel.ts`
  - 映射 architecture tab 到统一 tab 列表
  - 增加 `newArchitectureTab`
  - 增加 `activateArchitecture`
  - 增加 `closeArchitecture`
- [x] `src/renderer/src/components/tab-group/TabGroupPanel.tsx`
  - active tab 为 `architecture` 时渲染 `ArchitecturePanel`
- [x] 测试
  - `TabBar` 菜单有新项
  - 创建后 tab 出现在当前 group
  - 关闭、切换、分屏不破坏 terminal/browser/editor

当前实现说明：Phase 1 已接入 Orca 原生 tab 生命周期。`ArchitecturePanel` 已从占位替换为可交互架构画布，后续如需要和 Scryer ReactFlow 视觉完全一致，再单独迁移 `@xyflow/react` 版 C4Canvas。

- `corepack pnpm run tc:web`
- `corepack pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/tab-bar/group-tab-order.test.ts src/renderer/src/components/terminal/tab-type-cycle.test.ts src/renderer/src/lib/workspace-session.test.ts src/renderer/src/store/slices/tabs.test.ts`
- `corepack pnpm exec oxlint ...` 针对本次改动文件
- `corepack pnpm exec oxfmt --check ...` 针对本次改动文件

注意：`corepack pnpm run tc` 目前会在 `tc:cli` 阶段报一批既有 tsconfig include 错误，和本次 renderer tab 改动无关；`tc:web` 已通过。

### 2. 迁移 Scryer 模型类型和纯逻辑

- [x] 从 `scryer/src/types.ts` 迁移到：
  - `src/shared/scryer/model-types.ts`
- [x] 从 `scryer/crates/scryer-core/src/rules.rs` 迁移到：
  - `src/shared/scryer/rules.ts`
- [x] 从 `scryer/crates/scryer-core/src/lib.rs` 迁移模型文件逻辑到：
  - `src/main/scryer/model-store.ts`
- [x] 实现：
  - `getProjectScryerDir(projectPath)`
  - `getProjectModelPath(projectPath)`
  - `readModel(projectPath)`
  - `writeModel(projectPath, model)`
  - `readBaseline(projectPath)`
  - `writeBaseline(projectPath, model)`
  - `setImplementing(projectPath, active)`
  - `isImplementing(projectPath)`
  - `markSynced(projectPath)`
- [x] 从 `scryer/src/hooks/useModelStorage.ts` 迁移 parse/migration 逻辑到：
  - `src/shared/scryer/parse-model.ts`
- [x] 测试
  - 能读取空模型
  - 能创建 `.scryer/model.scry`
  - atomic write 不产生半截 JSON

可复用能力：`.scryer/model.scry`、`.scryer/model.baseline.scry`、`.scryer/.sync`、`.scryer/.implementing` 的项目内读写；空模型创建；无效 JSON 报错；原子写入。
下一轮 Native Engine 应固定为 upstream 0.3 行为：`model.scry` 缺少
`version: "0.3"` 或版本不匹配时拒绝加载；`planned.scry` 缺失时从 committed
回退；新建空模型必须写 0.3 `ScryModel`；正常 read/open 不做 pre-0.3 字段迁移。

### 3. 建立 Electron IPC 和 preload API

- [x] `src/preload/api-types.ts`
  - 增加 `architecture` API 类型
- [x] `src/preload/index.ts`
  - 暴露 `window.api.architecture.*`
- [x] `src/main/ipc/register-core-handlers.ts`
  - 注册架构图 IPC handler
- [x] API 初始集合：
  - `architecture.readModel(projectPath)`
  - `architecture.writeModel(projectPath, data)`
  - `architecture.watchModel(projectPath)`
  - `architecture.checkDrift(projectPath)`
  - `architecture.markSynced(projectPath)`
  - `architecture.callTool(projectPath, call)`
- [x] 测试
  - preload 类型通过
  - renderer 不能直接访问 Node fs
  - IPC 错误能显示给用户

当前状态：`src/main/ipc/architecture.ts` 注册 read/write/watch/drift/sync/native operation layer，文件变化通过 `architecture:modelChanged` 推到 renderer。

### 4. 迁移基础架构图 UI

- [x] 新建目录：
  - `src/renderer/src/components/architecture/`
- [x] 迁移并改写第一版可用画布：
  - `scryer/src/App.tsx` -> `ArchitecturePanel.tsx`，只保留 tab 内需要的部分
- [x] 已继续迁移 Scryer 人类交互视图：
  - `scryer/src/ContextPanel.tsx`
  - `scryer/src/FlowScriptView.tsx`
  - `scryer/src/GroupsView.tsx`
  - `scryer/src/SyncBar.tsx`
- [x] 已继续迁移 Scryer 代码层和 group overlay 视觉：
  - `scryer/src/CodeLevelRack.tsx`
  - Scryer group bubble 视觉的成员范围计算和 ReactFlow overlay
- [x] 已迁移并适配 Orca：
  - `scryer/src/C4Canvas.tsx` 的 ReactFlow 核心画布、面包屑、MiniMap、Controls、snap grid、auto layout 入口
  - `scryer/src/nodes/*` 的节点形状、person 节点、reference 节点、contract badge、hint badge、source link、component member chips
  - `scryer/src/edges/*` 的 relationship edge、状态颜色、双向边偏移、route waypoint、label/method 渲染
  - `scryer/src/edgeRouting.ts` 的 handle 分配逻辑
  - `scryer/src/edgeBundling.ts` 的 hub edge bundling 逻辑
  - `scryer/src/layout.ts` 的 code-level grid layout 和 d3-force auto layout
- [x] 删除/替换：
  - `@tauri-apps/api` 调用
  - Scryer 自带 settings panel
  - Scryer 独立 toast/provider
- [x] 接入 Orca：
  - [x] 使用 Orca 的 `sonner` toast
  - [x] 使用 Orca 的 `Button/DropdownMenu` 组件
  - [x] 使用 Orca 主题变量
  - [x] 禁止把 Scryer app 外壳嵌成“套娃页面”
- [x] 增加依赖：
  - [x] `@xyflow/react`
  - [x] `d3-force`
  - [x] `@types/d3-force`
  - [ ] `bubblesets-js`：当前未引入；Orca 先用 ReactFlow `ViewportPortal` 按成员节点位置渲染真实 group overlay，如后续要求有机 BubbleSets 曲线再单独引入
- [x] 测试
  - 架构图 tab 首屏不是空白
  - 可以新增节点
  - 可以拖动节点
  - 可以连线
  - 可以保存并重开

已修复的 live e2e 交互问题：

- ReactFlow selection 不能反向控制 Orca inspector 选中状态，否则会在 `null/id` 之间循环触发最大更新深度错误。
- 画布拖拽保存必须基于最新模型更新位置，避免覆盖刚保存的 source map。
- `Source pattern` blur 时必须读输入框当前值，不能依赖可能滞后的 React state。
- 模型 reload 不能无条件清空正在输入的 source pattern 草稿。

仍未追求像素级完全等价：Scryer package 里有 `bubblesets-js` 依赖，但当前源码没有直接调用点；Orca 现阶段实现的是真实成员范围 overlay，不是有机曲线 BubbleSets。若后续需要完全复刻 Scryer 的有机 bubble 形状，再单独引入该依赖。

### 5. 接 source map 和 Orca 文件打开

- [x] 改写 `SourceMapSection` 的核心编辑和打开文件逻辑
- [x] 把 Scryer `open_in_editor` 改成 Orca 内部打开文件
- [x] source map 点击后：
  - 优先在 Orca editor tab 打开文件
  - 有 line 时跳转行号
  - 文件不存在时给清楚提示
- [x] flow/source map 路径解析支持 `command` 字段保留
- [x] 测试
  - 点击 source map 打开当前 worktree 文件
  - line/endLine 正确传递
  - glob pattern 只在当前 worktree 内解析

当前状态：`src/shared/scryer/source-map-paths.ts` 会把 exact path 和 glob 都限制在当前 worktree 内，防止 `../` 跳出项目；Architecture 面板点击 source map 后会打开 Orca editor，并把行号传给 editor reveal 逻辑。live e2e 已验证 `src/index.ts` 能从架构节点跳到 Orca editor。

### 6. 迁移 Scryer operation 语义到 Orca CLI / Native TS engine

- [x] 新建 Orca native operation layer（现有文件名仍为 `mcp-tools.ts`）：
  - `src/main/scryer/mcp-tools.ts`
- [x] 完成 PRD #22 Native Scryer Engine first slice（2026-06-23，commit `56f950f7f`）：
  - `scryer.model.read`
  - `scryer.model.validate`
  - `scryer.node.update`
  - `scryer.link.add`
  - `scryer.link.delete`
  - `scryer.plan.pending`
  - `scryer.plan.fold`
  - Orca-native CLI：`orca scryer <noun> <verb>`
  - IPC forwarding：`architecture:executeScryerOperation`
  - Full Vitest baseline restored after follow-up red-test fixes：2029 files / 20032 tests passed
- [x] 建立 first-slice Native Scryer Engine 深模块：
  - `src/main/scryer/engine/index.ts`：唯一对外 engine interface；产品调用者只使用 `executeOperation(...)` 和 `readView(...)`
  - `src/main/scryer/engine/model.ts`：以 upstream Scryer 0.3 `ScryModel` 作为 canonical model
  - `src/main/scryer/engine/pipeline.ts`：contract-driven execution pipeline
  - `src/main/scryer/engine/paths.ts`：`.scryer/model.scry`、`planned.scry`、`.lock`、`history.jsonl`、`.anchors.json`、`.build_edges.json` 路径
  - `src/main/scryer/engine/state-store.ts`：parse/serialize/atomic file IO、planned fallback、committed/planned writes、baseline/history、`.lock`、Model Edit Lease token checks
  - `src/main/scryer/engine/pipeline.ts`：first-slice write lock、lease enforcement、completion gate meta
  - `src/main/scryer/engine/validators.ts`：validation seam，统一 incompatible、invalid input、blocking structural error、warning、post-fold committed validation taxonomy
  - `src/main/scryer/engine/operations/*`：Orca-native Scryer operation 实现
- [ ] 后续继续拆出/深化 Native Scryer Engine 子模块：
  - `src/main/scryer/engine/anchors.ts`：source anchor 和 `.anchors.json`
  - `src/main/scryer/engine/build-edges.ts`：`.build_edges.json` cache
  - `src/main/scryer/engine/drift.ts`：0.3 drift/reconcile/health 语义
  - `src/main/scryer/engine/view-selectors.ts`：从 `ScryModel` 派生渲染辅助数据，不承载持久化语义
  - `src/main/scryer/engine/extension-state.ts`：Orca flow/layout extension 状态读写，不进入 `ScryModel`
  - `src/main/scryer/engine/agent-run-bridge.ts`：Orca runtime seam，拥有 Model Edit Lease 生命周期、completion gate、cancel/crash cleanup、visible handoff
  - `src/main/scryer/engine/architecture-view-adapter.ts`：renderer view seam，把 `ScryModel` 派生为 `ArchitectureViewModel`，把 UI intent 映射到 operation input
  - `src/main/scryer/engine/import/pre-0.3-c4.ts`：可选一次性 pre-0.3 model import，不属于正常 runtime
- [x] 保持 deep module seam：
  - Native Scryer Engine 是唯一语义模块；删除它会导致 planned/committed、lock/lease、history、anchor、validation、envelope 规则散回多个调用者，因此它必须承载这些复杂性。
  - CLI、IPC、UI、drift/sync、agent runtime 是 adapter；它们只做参数归一化、operation 调用、结果渲染。
  - operation implementation 只写 Scryer domain semantics，不能解析 project、拿 lock、检查 lease、写 `.scryer/*`、追加 history 或运行 completion gate。
- [x] 将 first-slice Orca-native Scryer operations 固定在 current upstream Scryer 0.3 `ScryModel` 语义上；`C4ModelData` 不进入新 engine 正常读写状态。
- [x] 定义 `ScryerEngine` 外部 interface：
  - `executeOperation(id, input, context)`：Orca-native canonical 入口
  - `readView(project, options)`
- [x] 定义 first-slice `ScryerStateStore` 内部 seam：
  - 按 first-slice operation 读取 committed/planned/baseline/history。
  - 在 pipeline 控制下写入 planned、committed、baseline 和 history。
  - 该 seam 使用本地临时目录测试；产品调用者、operation 实现、transport adapter 都不能直接调用它。
- [x] 定义 first-slice `ScryerValidator` 内部 seam：
  - parse/version incompatibility -> `incompatible_model`
  - input schema failure -> `invalid_input`
  - blocking structural failure -> `validation_failed`
  - non-blocking warning -> `ok: true` payload warning
  - post-fold committed failure -> no partial write
- [ ] 定义 `ScryerAgentRunBridge` interface：
  - `beginModelEditSession(project, owner, context)`
  - `finishModelEditSession(session, outcome)`
  - `cancelModelEditSession(session, reason)`
  - bridge 拥有 lease lifecycle 和 completion gate；UI/CLI/IPC 不直接 acquire lease 或 run gate。
- [ ] 定义 `ArchitectureViewAdapter`：
  - `readView(...)` 只派生渲染数据，不生成第二份持久化模型。
  - UI mutation 先变成 operation input，再由 `engine.executeOperation(...)` 写入 planned/committed。
  - selection、expanded path、panel state、ReactFlow positions、diff glow、flow extension、agent runtime 状态均不进入 `ScryModel`。
- [ ] 定义 `ScryerOperationCatalog`：
  - operation id，例如 `scryer.model.read`、`scryer.node.update`、`scryer.plan.fold`
  - input schema、success payload schema
  - allowed error codes 和 error detail schemas
  - capability：read、draft_edit、implemented_fold、model_correction、code_extraction、drift_observation、drift_verdict
  - transaction reads/writes：planned、committed、history、baseline、anchors、build_edges
  - lock/lease requirement
  - side effects：history events、baseline refresh、anchors、build_edges、sync anchor
  - upstream parity anchors：source handler、request type、tests
  - CLI/UI invocation metadata
- [ ] 把每个 catalog entry 固定为 `ScryerOperationContract`；CLI、IPC、UI、agent runtime、drift/sync 和测试只能调用 contract 或 typed wrapper，不能自己解释 Scryer 状态语义。
- [ ] 实现 `ScryerOperationPipeline`：
  - load contract
  - validate `ScryerOperationContext`
  - validate input schema
  - resolve effective project
  - check capability authority and Model Edit Lease
  - acquire `.scryer/.lock` when declared
  - read declared layers/files
  - run operation-specific Scryer semantics
  - run declared validation
  - apply declared writes/side effects
  - validate success payload
  - return shared result/error envelope
- [x] 实现 first-slice operation pipeline：
  - validate `ScryerOperationContext`
  - resolve effective project
  - enforce write lock and active Model Edit Lease token
  - dispatch first seven operation implementations
  - return shared result/error envelope
- [x] 先落地最小语义闭环 contract，不按全量工具列表铺开：
  - `scryer.model.read`
  - `scryer.model.validate`
  - `scryer.node.update`
  - `scryer.link.add`
  - `scryer.link.delete`
  - `scryer.plan.pending`
  - `scryer.plan.fold`
- [x] 该闭环必须验证：0.3 `ScryModel` 读写、planned/committed 双层、draft edit、pending diff、fold commit、validation、lock/lease、result/error envelope、CLI/IPC transport 只转发。
- [x] 为首批 7 个 operation 写 `FirstContractMatrix`：
  - operation id、CLI command、input schema、success payload schema、error codes
  - reads/writes、lock policy、lease policy、validation policy
  - side effects：history、baseline、anchors、build_edges、sync anchor
  - upstream parity anchors：handler、request type、tests
- [x] contract tests、CLI mapping、IPC mapping 和 first-slice 实现顺序从矩阵派生。
- [ ] UI action mapping 从矩阵派生并迁移到 engine seam。
- [x] 首批 contract 的 Scryer 语义字段默认沿用 upstream 0.3 字段名；CLI ergonomic aliases 只能在 transport adapter 内归一化。
- [x] 定义统一 `ScryerOperationResult<T>` envelope：`ok: true` 时返回 typed `result`；`ok: false` 时返回 `ScryerOperationError`；CLI `--json` 和 IPC 原样传递，UI 后续只按 `error.code` / `details` / `fieldErrors` 渲染。
- [x] 定义 operation context：`requestId`、transport、caller kind、`cwd`、`projectRoot`、`workspaceRoot`、`sessionId`、`agentRunId`、可选 `leaseToken`、输出偏好。
- [x] context 的有效 project 解析顺序为 `input.project` -> `context.projectRoot` -> `context.cwd`；解析后统一在 engine 内完成路径规范化。
- [x] 定义 first-slice authority policy：无 active lease 时 UI/CLI/human 可做 draft edit；agent run 持有 Model Edit Lease 时，写操作必须带匹配 `leaseToken`，否则返回 `lease_required`；read operation 不需要 lease。
- [x] 定义结构化错误码：`incompatible_model`、`invalid_context`、`lock_busy`、`lease_required`、`invalid_input`、`not_found`、`illegal_link`、`operation_not_found`、`validation_failed`、`io_error`、`internal_error`。
- [ ] 将 Architecture tab 的持久化状态从 `C4ModelData` 改为直接消费 `ScryModel`；ReactFlow 布局、selection、expanded path、diff glow 等只能作为渲染派生状态。
- [ ] 拆分 Architecture tab 状态归属：
  - `ScryModel`：架构事实和 planned/committed 语义。
  - Orca workspace session：selection、expanded path、active tab、panel state、follow-navigation。
  - render cache：ReactFlow coordinates、measured size、edge route、diff glow。
  - Orca project-local extension：保留的 flow editor 数据。
  - Orca runtime：sync/agent run 状态、model edit lease、terminal/run id。
- [ ] 正常打开 `.scryer/model.scry` 时按 upstream 一致规则拒绝 pre-0.3 文件，不自动备份、不自动迁移。
- [ ] 如果确实需要保留 pre-0.3 Orca/Scryer 数据，另做显式 `import-pre-0.3-model`，一次性读取 `edges/flows/status/contract/sourceMap` 并写出新的 0.3 `ScryModel`，同时报告无法进入 ScryModel 的 flow 等数据。
- [x] 新增 Orca-native `orca scryer <noun> <verb>` CLI transport，并让 CLI 和 IPC 复用同一套 Native TS operation layer。
- [x] 让 CLI transport 调 `engine.executeOperation(...)` 或 operation typed wrapper，不在 CLI handler 里实现 Scryer 状态语义。
- [ ] 让 Architecture UI/IPC 的模型写入调 `engine.executeOperation(...)`，渲染读取调 `engine.readView(...)`，不直接写 `.scryer/model.scry` 或 `.scryer/planned.scry`。
- [ ] 按 ADR 0012 实现 planned/committed 写入矩阵：
  - draft edit：Architecture tab 普通编辑、`update_nodes`、`add_links` 等只写 planned。
  - implemented fold：`mark_implemented` 从 planned fold 到 committed。
  - code extraction：`set_model`、`fill_container` 这类已有代码抽取同时写两层。
  - model correction：`descope`、drop stale、accept reword 等显式修正同步处理两层。
  - drift observation：`flag_drift` 只写 planned 上的 vagrant/stale。
  - drift verdict：adopt/reject/reimplement/drop/reword 作为明确动作，不藏在保存里。
- [ ] 实现 Model Edit Lease：agent run 持有 lease 时，UI 只能改 view state，不能写模型文件；结束后 reload，不把 stale in-memory state 写回。
- [ ] 实现 Scryer Completion Gate：agent done 后自动检查 `scryer.plan.pending` 和 `scryer.model.validate`，未 close 的 plan 作为产品状态展示，不自动 blind fold。
- [ ] 测试策略按 deep module seam 执行：
  - engine contract tests 是主测试面，使用真实临时 `.scryer` 文件。
  - state-store 使用 local-substitutable filesystem fixture。
  - agent-run-bridge 使用 in-memory Orca runtime adapter。
  - CLI/IPC/UI 测 adapter 映射和渲染，不重复 engine 语义矩阵。
- [x] 当前分支已有一批可复用的模型操作实现，对应以下 upstream behavior anchors：
  - [x] `list_models`
  - [x] `get_model`
  - [x] `get_node`
  - [x] `get_changes`
  - [x] `get_rules`
  - [x] `get_structure`
  - [x] `add_nodes`
  - [x] `set_node`
  - [x] `update_nodes`
  - [x] `delete_nodes`
  - [x] `add_edges`
  - [x] `update_edges`
  - [x] `delete_edges`
  - [x] `set_flows`
  - [x] `delete_flow`
  - [x] `set_groups`
  - [x] `delete_group`
  - [x] `set_implementing`
  - [x] `update_source_map`
  - [x] `validate_model`
  - [x] `get_task`
- [ ] 以 current upstream 0.3 为准重新迁移产品工具语义：
  - [ ] `read_model`
  - [ ] `search_model`
  - [ ] `query_model`
  - [ ] `get_pending`
  - [ ] `get_drift`
  - [ ] `get_health`
  - [ ] `set_model`
  - [ ] `update_nodes`
  - [ ] `mark_implemented`
  - [ ] `move_nodes`
  - [ ] `set_node`
  - [ ] `delete_nodes`
  - [ ] `descope`
  - [ ] `move_responsibilities`
  - [ ] `add_links`
  - [ ] `update_links`
  - [ ] `delete_links`
  - [ ] `update_source_map`
  - [ ] `set_groups`
  - [ ] `update_group`
  - [ ] `delete_group`
  - [ ] `add_person`
  - [ ] `add_system`
  - [ ] `add_container`
  - [ ] `add_component`
  - [ ] `add_group`
  - [ ] `add_symbol`
  - [ ] `flag_drift`
  - [ ] `reconcile_drift`
  - [ ] `fill_container`
- [x] 重点保持 `get_task` 原语义：
  - [x] parent contract 继承
  - [x] notes 继承
  - [x] group scaffold 优先
  - [x] component sibling dependency
  - [x] parent status propagation
  - [x] operation/process/model 的 implemented 提醒
- [x] 测试
  - 用 fixture model 验证每个工具输出
  - `get_task` 顺序和 Scryer fixture 对齐
  - agent 修改模型后 renderer 自动刷新

已具备的可复用能力：实际读写 `.scryer/model.scry`、校验 C4 层级、递归删子树、更新 source map、输出项目结构树、输出 baseline diff，并通过 live e2e 验证 renderer 能看到外部写入。`get_task` 已补齐 group scaffold 优先、兄弟组件依赖排序、依赖环报告、父节点状态推进提示，以及 operation/process/model 的拟实现成员提醒。下一轮目标是把这些能力收敛进 Native Scryer Operation Catalog。

### 7. 迁移 drift detection 和 sync

- [x] 从 `scryer-core/src/drift.rs` 改写：
  - `checkSourceDrift`
  - `checkStructureDrift`
  - 忽略目录规则
- [x] 从 `scryer-acp/src/prompt.rs` 改写：
  - `initialModelPrompt`
  - `nodeFillPrompt`
  - `syncPrompt`
  - `serializeModelForPrompt`
- [x] 不直接照搬 `scryer-acp/runtime.rs`
  - 改用 Orca 现有 agent terminal 启动流程
  - sync 时可创建一个 agent terminal tab，并注入 prompt
  - agent 通过 Orca-native `orca scryer ...` CLI / native operation layer 更新 `.scryer/model.scry`
- [x] UI：
  - 第一版 drift report 和 mark synced 已接入 `ArchitecturePanel`
- [x] 后续 UI：
  - 改写 SyncBar 的核心流程到底部 Orca 原生状态条
  - sync 中锁住架构图编辑
  - 支持 cancel，cancel 恢复 pre-sync snapshot
  - 支持 finish，finish 更新 baseline 并解除 implementing lock
  - 支持 Orca agent 状态 `done` 后自动 finish
  - 支持手动 check drift，drift 明细节点可跳回架构图
- [x] 测试
  - source-mapped 文件变化会提示 drift
  - mark synced 后提示消失
  - [x] sync 失败显示错误
  - [x] cancel 恢复模型
  - [x] SyncBar check/finish/cancel/lock 走 Orca IPC 和 native Scryer operation layer
  - [x] Orca agent tab 报告 `done` 后自动 finish，清理 `.implementing` 并写 baseline

当前状态：`src/main/scryer/drift.ts` 会扫描当前 worktree，忽略 `.git/.scryer/node_modules/build/out` 等目录；按 source map glob 找到变更节点；按文件创建时间检测结构变化；`src/main/scryer/sync.ts` 会在 sync 前写 pre-sync 快照、设置 `.implementing`、生成给 Orca agent 的 sync prompt；cancel 会恢复快照，finish 会更新 baseline 并清掉临时状态。前端 controller 会监听新开的 Orca agent tab 的 `agentStatusByPaneKey`，当该 tab 报告非中断 `done` 时自动调用 `finishSync`。live e2e 已模拟“用户编辑架构图 -> mark synced -> 修改源码 -> drift report 命中 source-mapped node”，并覆盖 source map 打开 Orca editor、sync/cancel 恢复、agent done 自动 finish、重启恢复架构 tab。

### 8. Orca UI 打磨和快捷键

- [x] `New Architecture` 菜单文字和 icon
- [x] tab 标题：
  - 默认 `Architecture`
  - 有模型名时显示模型名
- [x] 空状态：
  - 当前项目没有 `.scryer/model.scry` 时提供创建按钮
  - 当前 worktree 不存在时禁用创建
- [x] 快捷键暂不占用，避免和现有 `Ctrl+T / Ctrl+Shift+B / Ctrl+Shift+M` 冲突
- [x] 分屏：
  - 架构图 tab 可拖到 split group
  - 同一个 worktree 可以打开多个架构图 tab，但共享同一个模型文件

### 9. 验证

- [x] 新增 package 依赖，并已更新 `pnpm-lock.yaml`
- [x] `pnpm run tc:web`
- [x] `pnpm run tc:node`
- [x] 改动文件 `oxlint`
- [x] 改动文件 `oxfmt --check`
- [x] focused unit suite：14 个文件、121 个测试
- [x] 新增/更新 e2e：
  - [x] `New Architecture` 菜单可见
  - [x] 新建架构图 tab
  - [x] 画布节点新增、改名、拖动
  - [x] `.scryer/model.scry` 写入
  - [x] native operation layer 写入后 UI 自动刷新
  - [x] source-mapped 代码改动触发 drift report
  - [x] FlowScriptView 新建步骤、mention 插入、条件分支、flow source map 打开 editor
  - [x] GroupsView 新建 group、拖入成员、group 嵌套、成员移除并持久化
  - [x] SyncBar 手动 drift check、dismiss、sync/cancel/finish 状态链
  - [x] SyncBar 接 Orca agent 状态，agent `done` 后自动 finish
  - [x] 切换 terminal/browser/editor/architecture 不丢状态
  - [x] 重启后恢复 architecture tab
- [x] live e2e：
  - [x] 画布编辑、`.scryer/model.scry` 写入、工具层写入刷新、drift 检测
  - [x] source map 打开 Orca editor、sync/cancel 恢复
  - [x] flow 和 group 视图的真实人类交互
  - [x] Orca agent 状态 `done` 后自动 finish
  - [x] clean relaunch 后恢复 architecture tab 和模型状态
- [x] 手动/自动检查：
  - 首屏不空白
  - 画布能交互
  - 保存文件可读
  - agent 能通过 Orca-native `orca scryer ...` CLI 读写模型

## 建议执行顺序

先做 Phase 1 到 Phase 3，得到一个 Orca 原生的空架构图 tab 和本地模型文件读写。
再迁移 Scryer 画布。
最后迁移 Scryer operation 语义、drift sync 和 agent 联动。

这样每一步都能单独测试，不会一次性把 Scryer 全部搬进来后才发现 Orca tab 生命周期、会话恢复或 IPC 不通。
