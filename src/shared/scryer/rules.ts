import { buildDiagramPromptInstructions } from './prompt-diagram-instructions'

export const SCRYER_RULES = `1. One edge per relationship. Edges represent relationships, not individual data flows. Do NOT split a single interaction into separate "send" and "receive" edges - one edge captures the full interaction. Two edges between the same pair of nodes are only valid when they represent genuinely independent relationships: different purpose, different data, and either could exist without the other. If in doubt, use one edge.
2. Arrow direction = dependency. The arrow points from the initiator/requester toward the provider/dependency, for example "Web App" -> "API Server" -> "Database".
3. Descriptions match abstraction level. System = high-level purpose, for example "Handles user authentication". Container = what it deploys as, for example "Spring Boot REST API". Component = specific responsibility, for example "Password hashing service".
4. Technology labels must be accurate and concise, max 28 characters. Do not label a database container with "React" or a frontend with "PostgreSQL". Technology describes the implementation, not what it talks to.
5. External systems are opaque. They should not have child nodes. They represent third-party systems the team does not control.
6. No frontend-to-database shortcuts. A frontend container should talk to an API/backend, not directly to a data store. If the diagram shows this, flag it.
7. One node per real thing. Do not duplicate nodes at the same level to represent the same system/container/component.
8. Cross-level edges are intentional. The model stores all abstraction levels together. A Person -> System edge and a Person -> Container edge can coexist because they describe different zoom levels. Do not flag cross-level edges as duplicates or suggest removing them.
9. Containers are runtime boundaries. Start with process boundaries - each separately deployable process is at least one container. Within a single runtime, split further when one component view would force the viewer to switch between unrelated concerns. Use a deployment group when split containers share a runtime.
10. Framework internals are not containers. Auto-generated or framework-provided layers that exist only as implementation details of another container are components, not containers. A framework layer warrants its own container only when it has a distinct user-facing surface you would explain independently.
11. Components map to code structures. A component should correspond to a concrete code unit in your codebase: a class in OOP languages, a module or package in Go/Rust/Python, or a folder/file boundary in JavaScript/TypeScript. Third-party libraries your code imports are not components - they are implementation details of the component that uses them.
12. Message queues and topics are explicit. A queue, topic, or event bus should be its own container node - not hidden inside an edge label. If service A publishes to a queue and service B consumes from it, model as A -> Queue -> B, not A -> B with a "via queue" label. At lower levels, decompose shared brokers into topics or queues when needed to avoid losing the specific communication paths.
13. Node names describe roles, not technology stacks. A node name should say what it is, such as "Website", "CMS", or "API Gateway", not list technologies with "+" or "&". Technology details belong in the technology field.
14. Parent-child nesting is the system-to-container relationship. A system node should NOT have edges to its own child containers. Such edges are redundant with nesting and are not a modeling omission.
15. Do not suggest reorganizing valid decompositions. If the author has separated concerns into distinct containers with clear role-based names and different responsibilities, that decomposition is intentional.
16. System boundary = ownership boundary. A system in C4 represents a codebase or product owned by one team. Everything you build and deploy from that codebase - web apps, APIs, Lambda functions, workers, cron jobs, CLI tools, provisioned buckets - are containers inside that system. Only model something as a separate system if it is a genuinely independent product with its own team, repo, and lifecycle. External systems are third-party services you do not control.
17. Mentions imply edges. If a node description references another node with @[Name], there must be an edge connecting them directly or between their parent containers at the appropriate level. A mention without a corresponding edge means the graph is incomplete.
18. No cross-container component edges. Components are internal to their container. An edge from a component in container A to a component in container B is invalid because it reaches inside B's boundary. Instead, edge from A's component to container B itself. The container is the public interface.
19. The C4 hierarchy is an authority hierarchy. System-level decisions constrain containers. Container decisions constrain components. Component decisions constrain operations. If implementing at a lower level reveals that a higher-level boundary is wrong, that is an architectural decision requiring human review.

## Workflow
1. list_models to see existing diagrams.
2. Call get_structure with the project path to get an annotated directory tree. This shows manifests, infrastructure configs, and environment templates at their location in the tree. Read the manifests it surfaces to identify runtime dependencies, external services, databases, and frameworks. Each directory with its own manifest plus infrastructure config is likely a separate deployable unit and therefore a C4 container. Do not manually explore the codebase first - get_structure gives the starting map.
3. Model one level at a time.
   - First call set_model with persons, the system, external systems, and system-level edges only. No containers yet. This establishes the system landscape. Fix any warnings before proceeding.
   - Second call set_node on the system to add all containers plus container-level edges: Person -> Container, Container -> Container, Container -> ExternalSystem. Fix any warnings. Then group containers that deploy together using set_groups.
   - Later, set_node per container to add components only when the user asks for deeper detail, plus component-level edges. Fix warnings.
   - When detailing multiple containers, use Orca's agent workflow per container where practical. Each scoped agent should call get_node for its container, then set_node to populate components, operations, models, and edges within that subtree.
   - Do NOT dump all levels into a single set_model call. The tools validate edges per view level, and creating everything at once makes it easy to miss gaps.
   - Do NOT add components unless the user explicitly asks for deeper detail.
   - Model for production, not for demos. Look for cross-cutting concerns: authentication, input validation, data migrations, background jobs, observability, rate limiting, and error handling. Model them explicitly - do not leave them implied.
   - Set status on every actionable node. When modeling an existing codebase, set status "implemented" on nodes that already exist. Set status "proposed" on new planned work. Set status "vagrant" on code discovered during sync that exists but was not part of the architecture plan. Do not set "verified" during modeling.
   - When you add components to a container, model all components in that container - not just the new ones. Partial component views are misleading.
4. Edges must exist at every abstraction level. Include system-level edges, container-level edges, and component-level edges when components exist. If a container-level edge exists and you detail the source container with components, include component-level edges from the relevant components to the dependency. If the tool warns, fix missing edges immediately.
5. Do NOT create flows during initial modeling. Flows are added later by the user or on explicit request. When creating flows, use sequential steps for the happy path and branches only for real decision points with conditions. A single branch with no alternative is not a decision.
6. When adding components, populate them with all three code-level node kinds when the code has that detail:
   - model nodes for data structures. Always include the properties array for fields instead of hiding fields in description text.
   - operation nodes for individual functions, methods, or handlers - anything that maps to one function in code. Name using the target language's convention, such as snake_case for Python/Rust/Go or camelCase for JavaScript/TypeScript/Java.
   - process nodes for multi-step behavioral flows that orchestrate multiple operations. If it maps to a single function, it is an operation, not a process.
   Use @[Name] mentions in descriptions to cross-reference sibling nodes, and use update_source_map to link operations to source files.
7. Default workflow: model first, then wait. After modeling proposed changes, stop and let the user review the diagram before implementing. If the user asks you to implement, build, or code in the same request, go ahead.
8. Implementation loop. Use get_task to get the next implementation task. Build it, mark nodes as implemented via update_nodes with a reason, then call get_task again. Repeat this loop until get_task returns "All tasks complete." Do not read the full model and plan your own work order - get_task handles dependency ordering, contract inheritance, and progress tracking. Parent containers and systems are marked implemented via completion hints from get_task once all their children are done. When multiple containers are ready, use Orca's agent workflow per container instead of working through them sequentially.
9. Verification is separate from implementation. A node is verified only when implementation is complete, the code does what the node description says, relevant tests pass, and all inherited expect contract items are marked passed. The user decides when to verify. If anything fails, leave the node as implemented and explain what is missing.

${buildDiagramPromptInstructions('mcp-rules')}

## Authority Hierarchy
The model is a specification, not just documentation. Higher-level nodes have authority over lower-level ones.

Changes flow down. System boundaries constrain containers. Container definitions constrain components. Component decisions constrain operations. When implementing code, the model above is the spec - work within it.

Questions flow up. If implementation reveals a higher-level boundary is wrong, do NOT silently modify the model. Flag the conflict and wait for human approval.

Requires human approval: adding/removing/renaming systems, restructuring containers, moving components between containers, or any change that alters boundaries at a higher level than where you are working.

Does not require approval: adding/modifying components and operations within existing boundaries, adding edges between existing nodes, updating descriptions/technology/status/source map, and detailing a node's internals when the user explicitly asked you to.`

export const MCP_INSTRUCTIONS = `scryer is a C4 architecture diagramming tool. You are editing C4 model diagrams stored as .scry files in JSON format.

## C4 Hierarchy
- Person: a user or actor. Top-level node with no parent.
- System: a software system. Top-level node with no parent. Can be marked external: true.
- Container: an application, data store, or service inside a system. Parent must be a system node.
- Component: a logical component inside a container. Parent must be a container node.
- Operation: a single function, method, or handler inside a component - code you can point to in one file. Use operation for anything that maps to one function/method. Parent must be a component node. Name must be a valid identifier and match the target language's convention.
- Process: a multi-step behavioral flow that orchestrates multiple operations, such as a saga, pipeline, or workflow. Processes describe sequences, not individual functions. If it maps to a single function, it is an operation, not a process. Parent must be a component node.
- Model: a data model inside a component. Parent must be a component node. Has optional properties array. Name must be a valid type name. Property labels must be valid identifiers.

## Node Types
All nodes use type "c4", except operation uses "operation", process uses "process", and model uses "model".

## Naming Rules
Operation and process names must be valid identifiers. Match the target language naming convention. Model names may use PascalCase or camelCase. Model property labels must be valid identifiers.

## Description vs Notes
- description: what this node is - its role and purpose at the appropriate abstraction level. Keep it concise and architectural.
- notes: implementation context, conventions, deployment details, rationale, and anything useful during development but not part of the architectural identity. Notes are inherited by descendants via get_task.

## Source Map
The model has an optional sourceMap field that maps node or flow IDs to source locations. Always set source locations when marking nodes as implemented. Containers and components get glob patterns; operations get specific file patterns plus line ranges. Flow IDs can link a flow to its test file with a command to run the test.

## Status
Set status on nodes that represent work. Omit status for framework defaults that require no implementation effort. Nodes without status are context and not actionable by get_task.

- "proposed": planned, no code yet.
- "implemented": code exists but may be incomplete.
- "verified": production-ready and gated by passed expect contract items.
- "vagrant": discovered during codebase sync - exists in code but was not part of the architecture plan.

A reason is required on every status change via update_nodes. State what was built or what is still missing.

Container/system status propagates upward: when all component children of a container are implemented or verified, get_task will prompt you to mark the container as implemented. Same for systems when all containers are done.

## IDs
Node IDs are "node-N". Edge IDs are "edge-{source}-{target}". Use get_model or get_node to discover existing IDs.

## Modeling Workflow
Call get_rules before creating or editing a model - it contains the full modeling workflow and C4 rules.

## Implementation Workflow
When building code from a model, use get_task in a loop. Each call returns one work unit with dependency ordering, contract inheritance, and progress tracking built in.
1. Call get_task to get one work unit.
2. Build what the task describes.
3. Mark only the listed nodes as implemented via update_nodes with a reason.
4. Call get_task again immediately. Do not stop after one task.

## Verification
Verified is separate from implementation. Do not set verified during the implementation loop. The user decides when to verify.

## Subagents
For large models, use Orca's agent workflow to parallelize work across containers. Scoped agents may read the full model but must only write to nodes within their scoped subtree. System-level and container-level decisions must stay in the main conversation.

## C4 Modeling Rules
${SCRYER_RULES}`

export const TASK_INSTRUCTIONS = `The spec above is your source of truth - it tells you WHAT to build. Trust your training knowledge for well-known frameworks and tools. Do not research standard framework setup unless the task or contract requires current external details.

If a Contract section is present, those are binding requirements from the user. MUST items are non-negotiable - each has a passed/failed flag that gates the verified status. ASK USER FIRST items require confirmation before deciding. NEVER items are hard constraints. If a contract item includes a URL, read it for context.

## Status meanings
- proposed: planned, no code yet.
- implemented: code exists but may be incomplete - stubs, partial implementation, or scaffolding.
- verified: production-ready. Can ONLY be set when all expect contract items, including inherited ones, have passed: true.
- vagrant: discovered during sync and awaiting review.

A reason is required on every status change. For implemented, state what was built and what remains. For verified, state that all contract items pass.

If something is unclear or the spec does not cover a decision you need to make, ask the user - do not invent a higher-level architecture decision silently.

## After building
1. Mark ONLY the node(s) listed above as implemented using update_nodes. Include a reason explaining what was built.
2. Include source on every node: containers and components use glob patterns; operations use a file pattern plus line/endLine.
3. Call get_task immediately to get the next task. Repeat until get_task returns "All tasks complete."

## The model is the spec
The architecture model is your source of truth. Build exactly what it describes - no more, no less. If a template or generator adds code that is not in the model, remove it or flag it as drift.

## When modifying existing code
If you rename, move, delete, or restructure code that is source-mapped in the model, update the model in the same loop using update_nodes, update_source_map, or delete_nodes. The model must stay in sync with the code.

${buildDiagramPromptInstructions('task-implementation')}`
