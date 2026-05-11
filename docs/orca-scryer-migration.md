# orca-scryer 迁移计划

生成时间：2026-05-10

## 当前工作区

- 目标工作区：`/home/ljian/wspace/orca-scryer`
- 目标项目：`orca/`，来源仓库 `https://github.com/stablyai/orca`
- 功能来源：`scryer/`，来源仓库 `https://github.com/aklos/scryer`
- GitNexus 索引结果：
  - `scryer`：3,011 个节点，4,681 条关系，61 个功能区，175 条流程
  - 当前 workspace 的 `orca`：29,012 个节点，53,419 条关系，1,144 个功能区，300 条流程

## 总结结论

建议不要把 Scryer 整个 Tauri 应用直接塞进 Orca。合理做法是：

1. 保留 Scryer 的核心模型、画布、C4 层级、source map、MCP 工具语义、任务排序和 drift sync 逻辑。
2. 舍弃 Scryer 的 Tauri 外壳、独立桌面设置页、独立 AI provider 设置、独立 Agent 启动方式。
3. 把后端能力改写到 Orca 的 Electron/Node IPC 和 Orca 自己的 agent/tab 体系里。
4. 在 Orca 的 `New tab` 菜单里新增 `New Architecture`，打开一个原生 Orca tab，而不是外部窗口或 webview。

AI provider 边界已经明确：不迁移 Scryer 的 `scryer-suggest` provider 设置，不在 Orca 里再做一套 OpenAI/Anthropic/Ollama 配置。架构图的 AI 能力走 Orca 已有 agent 体系，例如 Codex/Claude 终端和 Orca agent hooks；Scryer 迁移部分只提供模型、MCP 工具、任务提示、source map 和 drift sync 所需的数据接口。

重要限制：Scryer 当前是 `FSL-1.1-MIT`，Orca 是 `MIT`。如果要把 Scryer 源码直接复制进 Orca 并公开发布，需要先确认许可证是否允许这个集成场景；否则应改成“可选外部集成”或先取得授权。

第二阶段按“前端交互 -> 前端模型状态 -> IPC/后端持久化 -> MCP/agent 外部改写 -> 前端重新理解状态”的完整链路迁移，而不是只补 UI 按钮。详细 UML 对比、时序图、状态机和细粒度完成情况见：

- `docs/orca-scryer-uml-gap-analysis.md`

## Scryer 功能链

### 必须继承

- C4 模型数据：
  - `nodes`
  - `edges`
  - `startingLevel`
  - `sourceMap`
  - `projectPath`
  - `refPositions`
  - `groups`
  - `flows`
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
  - `.scryer/model.baseline.scry`
  - `.scryer/.sync`
  - `.scryer/.implementing`
  - 文件监听和自动保存
- MCP 工具语义：
  - `list_models`
  - `get_model`
  - `get_node`
  - `get_task`
  - `update_nodes`
  - `delete_nodes`
  - `update_edges`
  - `delete_edges`
  - `set_flows`
  - `set_groups`
  - `update_source_map`
  - `validate_model`
  - `get_rules`
  - `get_changes`
  - `get_structure`
- 任务排序逻辑：
  - container/component 作为主要任务单位
  - 组件依赖按 edge 方向约束
  - contract 和 notes 从父节点继承
  - group scaffold 优先
- drift sync：
  - source-mapped 文件变化检测
  - 项目结构变化检测
  - sync 前快照
  - sync 完成后 diff 和 baseline 更新

### 需要改写

- Scryer 的 Tauri `invoke(...)` 要改成 Orca 的 preload API 和 Electron IPC。
- Rust 的 `scryer-core` 文件读写、drift、scan、rules 逻辑要改写成 TypeScript/Node 模块，除非决定把 Rust binary 作为 sidecar。
- `scryer-mcp` 要改成 Orca 内置 MCP server 或单独的 Node CLI。
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
- 如果文件不存在，创建空模型。
- 可以编辑 C4 节点和连线。
- 可以保存到 `.scryer/model.scry`。
- 可以通过 MCP 让 agent 读取和修改模型。
- 修改模型后 Orca tab 内实时刷新。
- source map 可以映射到 Orca 当前项目文件。
- drift sync 能提示“代码和架构图不一致”。

暂不做：

- 独立模板市场
- 多 provider AI advisor
- 外部 Scryer 桌面 app 联动
- 自动迁移所有历史 `.scry` 模型
- 和 Scryer 上游完全保持 UI 一致

## 逐项迁移清单

### 0. 准备和风险确认

- [x] 创建 workspace：`/home/ljian/wspace/orca-scryer`
- [x] 克隆 Orca 和 Scryer
- [x] 用 GitNexus 索引两个仓库
- [x] 定位 Orca new tab 菜单和 tab 模型
- [x] 定位 Scryer 模型、画布、MCP、drift、agent sync 逻辑
- [ ] 明确许可证处理方式
- [x] 决定后端路线：TypeScript 改写，还是 Rust sidecar

推荐路线：TypeScript 改写。原因是 Orca 已经是 Electron/Node 应用，走同一套 IPC、测试和打包更稳。

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
  - 能保留旧字段迁移逻辑
  - atomic write 不产生半截 JSON

本轮已完成：`.scryer/model.scry`、`.scryer/model.baseline.scry`、`.scryer/.sync`、`.scryer/.implementing` 的项目内读写；旧模型字段 `guidelines/references/scenarios` 迁移；空模型创建；无效 JSON 报错；原子写入。

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

本轮已完成：`src/main/ipc/architecture.ts` 注册 read/write/watch/drift/sync/MCP bridge，文件变化通过 `architecture:modelChanged` 推到 renderer。

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

Phase 2 第一轮已完成 ReactFlow 核心画布迁移：`ArchitectureCanvas.tsx` 使用 `@xyflow/react` 渲染 C4 节点和关系边，支持 root/子层级 drilldown、单根系统自动钻入、面包屑返回、节点拖拽保存、ReactFlow 连线、删除、source map 链接、MiniMap/Controls。`c4-model.ts` 承担可见节点计算、引用节点、删除级联、布局位置写回、C4 下一层级推导等纯逻辑，并有独立单元测试。

Phase 2 第二轮已继续补齐 Scryer 视觉和布局链：节点组件已从画布内联实现拆到 `nodes/*`，边组件拆到 `edges/*`，布局和边路由拆到 `layout/*`。当前实现不是静态壳：auto layout 会真实写回当前层节点坐标；edge routing 会按节点方向和拥挤度选择 handle；edge bundling 会给 hub 节点多条同向边写入 `_route` waypoint；RelationshipEdge 会按 `_route/_biPair/_status` 渲染折线、双向偏移、状态色、箭头和 label。

Phase 2 第三轮已开始补 Scryer 的人类交互链：移除 Orca 初迁移里多余的默认 ReactFlow MiniMap/Controls，把自动布局收敛到画布工具条；新增 `ArchitectureContextPanel`，选中节点后可编辑 id/kind/name/technology/external/shape/description/status/source map/relationships/notes/contract，并显示前端版 `get_node` 上下文；选中边后可编辑 source/target/label/method 并可删除关系。画布现在维护节点和边两类选中状态，边 label 可点击选中，节点选中后出现 drill-in 按钮进入下一层 C4 视图。相关纯逻辑已抽到 `c4-model.ts`：`updateEdgeDataInModel`、`deleteEdgesFromModel`、`getNodeContextForModel` 都有单元测试；live e2e 已覆盖 MiniMap/Controls 消失、边编辑、节点上下文操作、drill-in、source map、sync/cancel 和重启恢复。

本轮还修复了第一阶段 live e2e 暴露出的真实交互问题：

- ReactFlow selection 不能反向控制 Orca inspector 选中状态，否则会在 `null/id` 之间循环触发最大更新深度错误。
- 画布拖拽保存必须基于最新模型更新位置，避免覆盖刚保存的 source map。
- `Source pattern` blur 时必须读输入框当前值，不能依赖可能滞后的 React state。
- 模型 reload 不能无条件清空正在输入的 source pattern 草稿。

Phase 2 第四轮已继续补齐 Scryer 的 flows、groups 和 sync bar 交互链：`FlowScriptView` 接入 Orca 原生 Architecture tab，支持 flow tab 切换、新建/删除 flow、步骤新增/删除、条件分支、分支内步骤、同级步骤拖拽排序、`@[node]`/`@[step]` mention 下拉插入、mention 渲染和点击跳转，以及 flow source map 打开 Orca editor；`GroupsView` 接入 `@dnd-kit/core`，支持当前 C4 层级内的 group 创建、重命名、说明编辑、节点拖入 group、成员移除、group 嵌套、拖回顶层和保存到 `.scryer/model.scry`；`SyncBar` 改成底部常驻状态条，连接 Orca agent terminal 的 sync prompt、drift check、lock/unlock、finish/cancel、drift 明细展开和节点跳转。以上逻辑都走 Orca IPC/preload/model-store，不走 Scryer Tauri invoke，也不是静态壳。

Phase 2 第五轮已把分散在 `ArchitecturePanel` 里的模型状态链抽到 `useArchitectureModelController`：模型读取、文件监听、写入、外部变更 diff/follow、selection、undo/redo、flow/group/source map mutation、drift、sync/cancel/finish 都从 controller 输出给 UI 组件。`CodeLevelRack` 已接入 component 下的 operation/process/model 层级，新增/删除/选择都会写回同一个 C4 模型；group bubble 已按当前可见成员节点位置计算范围，并通过 ReactFlow `ViewportPortal` 渲染到画布底层。Sync 自动收尾也接入 Orca agent 状态：新开的 agent tab 报告 `done` 且不是用户中断时，会自动调用 `finishSync`，更新 baseline 并清除 `.implementing`。

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

本轮已完成：`src/shared/scryer/source-map-paths.ts` 会把 exact path 和 glob 都限制在当前 worktree 内，防止 `../` 跳出项目；Architecture 面板点击 source map 后会打开 Orca editor，并把行号传给 editor reveal 逻辑。live e2e 已验证 `src/index.ts` 能从架构节点跳到 Orca editor。

### 6. 迁移 MCP server 语义

- [x] 新建 Orca 内置 MCP bridge：
  - `src/main/scryer/mcp-tools.ts`
- [ ] 后续如要给外部 agent 暴露 stdio MCP server，再拆成：
  - `src/mcp/scryer/server.ts`
  - `src/mcp/scryer/tools/*`
- [x] 从 Rust MCP 逐个迁移工具：
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

本轮已完成：MCP bridge 不是空壳，已经能实际读写 `.scryer/model.scry`、校验 C4 层级、递归删子树、更新 source map、输出项目结构树、输出 baseline diff，并通过 live e2e 验证 renderer 能看到 MCP 写入。`get_task` 已补齐 group scaffold 优先、兄弟组件依赖排序、依赖环报告、父节点状态推进提示，以及 operation/process/model 的拟实现成员提醒。

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
  - agent 通过内置 MCP 工具更新 `.scryer/model.scry`
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
  - [x] SyncBar check/finish/cancel/lock 走 Orca IPC 和 MCP bridge
  - [x] Orca agent tab 报告 `done` 后自动 finish，清理 `.implementing` 并写 baseline

本轮已完成：`src/main/scryer/drift.ts` 会扫描当前 worktree，忽略 `.git/.scryer/node_modules/build/out` 等目录；按 source map glob 找到变更节点；按文件创建时间检测结构变化；`src/main/scryer/sync.ts` 会在 sync 前写 pre-sync 快照、设置 `.implementing`、生成给 Orca agent 的 sync prompt；cancel 会恢复快照，finish 会更新 baseline 并清掉临时状态。前端 controller 会监听新开的 Orca agent tab 的 `agentStatusByPaneKey`，当该 tab 报告非中断 `done` 时自动调用 `finishSync`。live e2e 已模拟“用户编辑架构图 -> mark synced -> 修改源码 -> drift report 命中 source-mapped node”，并覆盖 source map 打开 Orca editor、sync/cancel 恢复、agent done 自动 finish、重启恢复架构 tab。

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

- [x] 本轮新增 package 依赖，并已更新 `pnpm-lock.yaml`
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
  - [x] MCP bridge 写入后 UI 自动刷新
  - [x] source-mapped 代码改动触发 drift report
  - [x] FlowScriptView 新建步骤、mention 插入、条件分支、flow source map 打开 editor
  - [x] GroupsView 新建 group、拖入成员、group 嵌套、成员移除并持久化
  - [x] SyncBar 手动 drift check、dismiss、sync/cancel/finish 状态链
  - [x] SyncBar 接 Orca agent 状态，agent `done` 后自动 finish
  - [x] 切换 terminal/browser/editor/architecture 不丢状态
  - [x] 重启后恢复 architecture tab
- [x] live e2e：
  - [x] 画布编辑、`.scryer/model.scry` 写入、MCP 写入刷新、drift 检测
  - [x] source map 打开 Orca editor、sync/cancel 恢复
  - [x] flow 和 group 视图的真实人类交互
  - [x] Orca agent 状态 `done` 后自动 finish
  - [x] clean relaunch 后恢复 architecture tab 和模型状态
- [x] 手动/自动检查：
  - 首屏不空白
  - 画布能交互
  - 保存文件可读
  - agent 能通过 MCP 读写模型

## 建议执行顺序

先做 Phase 1 到 Phase 3，得到一个 Orca 原生的空架构图 tab 和本地模型文件读写。
再迁移 Scryer 画布。
最后迁移 MCP、drift sync 和 agent 联动。

这样每一步都能单独测试，不会一次性把 Scryer 全部搬进来后才发现 Orca tab 生命周期、会话恢复或 IPC 不通。
