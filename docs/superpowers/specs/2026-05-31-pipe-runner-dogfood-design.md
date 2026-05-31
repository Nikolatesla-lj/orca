# Pipe Runner E2E Validation Design

## Purpose

Build a small React component game to test the Scryer Diagram Library against a real development loop: design, code, C4 modeling, Mermaid/UML detail diagrams, diagram-to-code refs, live play testing, and repair.

This is an E2E validation sample, not an Orca product feature. It lives under the legacy `docs/scryer-dogfood/pipe-runner/` path so it can be reviewed and removed independently without changing current links.

## Product Shape

`Pipe Runner` is an original side-scrolling platform game inspired by classic platform mechanics without using protected characters, images, names, music, or level assets.

The player can:

- Move left/right.
- Jump.
- Collect coins.
- Avoid or stomp an enemy.
- Reach a goal flag.
- Restart after taking damage or winning.

## Test Focus

The main test target is not game polish. The target is whether Scryer can support a realistic coding task end to end, especially whether Mermaid/UML diagrams are detailed enough to find real code and behavior problems.

The test should emphasize these product-critical checks:

1. Design-to-code traceability: the design doc must map to actual React modules, game rules, and source files. A reviewer should be able to start from the design and find the code that implements movement, jumping, scoring, damage, restart, and winning.
2. Code-to-C4 accuracy: generated C4 nodes must reflect the real module boundaries. The model must not invent a backend, database, API, or controller that this sample does not have.
3. UML behavior detail: Mermaid diagrams must show the game loop, keyboard-to-render sequence, player state transitions, collision decision branches, and module relationships at a level where wrong logic can be spotted.
4. Diagram-to-code refs: `diagramRefs` must connect diagrams to the right C4 nodes, flow steps, and source file patterns. The refs must prove that a diagram is attached to real code, not just stored as standalone markdown.
5. Cross-view consistency: C4 model, UML diagrams, flow descriptions, and source refs must describe the same architecture and behavior. If a diagram says collision happens in `physics.ts`, the referenced code must actually contain that collision path.
6. Live play proof: Playwright must interact with the real page using keyboard input and verify visible HUD and HTML Canvas game surface results. It must not pass by only reading internal objects or mocked state.
7. Complex human workflow: the live test must combine actions the way a human would: focus the HTML Canvas game surface, start playing, move, jump, collect coins, hit or stomp an enemy, restart after failure, and finish the level.
8. Bug review loop: if live play finds a bug, the fix must update the code and, when behavior or ownership changes, the matching `.scry` model or UML diagram refs.
9. Source of truth safety: `.scry` must store model data, diagram source, and refs only. It must not persist SVG, PNG, diagnostics, `rendererVersion`, or `sourceHash`.

These checks intentionally stress the Scryer Diagram Library's core promise: diagrams should help a developer understand, review, and repair real software, not merely decorate a task.

## Architecture

The sample has one Vite/React page with an HTML Canvas game surface.

Code units:

- `App`: page shell, HUD, instructions, and game host.
- `GameCanvas`: HTML Canvas game surface component, keyboard focus, and rendering bridge.
- `useGameLoop`: React hook that owns `requestAnimationFrame` and keyboard input state.
- `game-engine`: pure game update logic and state transitions.
- `physics`: movement, gravity, collision, stomp, damage, coin pickup, and goal checks.
- `level`: deterministic level data.
- `render`: HTML Canvas game surface drawing.
- `types`: shared game data types.

## Data Flow

1. Keyboard input is captured by the HTML Canvas game surface host.
2. `useGameLoop` passes input and elapsed time into `updateGame`.
3. `updateGame` applies physics, collisions, score, lives, and win/death transitions.
4. `renderGame` draws the current state to the HTML Canvas game surface.
5. React renders HUD text from the current game state so tests and humans can read the result.

## Game Rules

- The player starts with 3 lives.
- Side-hitting an enemy costs 1 life and respawns the player. Falling or hazard damage must use the same rule when a level includes a pit or hazard.
- Jumping on an enemy defeats it and adds score.
- Coins add score and stay collected until restart.
- Reaching the goal changes status to `won`.
- Pressing `R` restarts the level.

## Executable Game Contract

The game implementation and live test must satisfy these deterministic rules. A test that only proves the page rendered is not completion evidence.

| Trigger/input | Required state transition | Required HUD result | Required HTML Canvas game surface evidence |
|---|---|---|---|
| Initial page load | `status` is `ready`; score, coins, and lives are reset. | `Status: ready`, `Score: 0`, `Lives: 3`, `Coins: 0`. | HTML Canvas game surface has non-background pixels after first render. |
| Focus HTML Canvas game surface and press Right or `D` | `status` becomes `playing`; player x position increases while the key is held. | `Status: playing`; score/lives/coins unchanged until a rule event occurs. | HTML Canvas game surface frame changes or the player/camera position changes from the initial frame. |
| Press Space, Up, or `W` while grounded | Player enters a jump arc and later lands on a platform. | Status remains `playing`; lives do not change for a clean jump. | Pixel probe or visible state shows vertical movement before landing. |
| Intersect an uncollected coin | That coin becomes collected and remains collected until restart. | Coins increases by 1; score increases by 10. | The coin is no longer drawn in the same location after collection. |
| Fall below the world or touch a hazard, when the level includes one | Lives decreases by 1; player respawns at spawn; invulnerability window starts. | Lives changes from 3 to 2 on first damage; status remains `playing` unless lives reaches 0. | Player is drawn near spawn after damage. |
| Intersect enemy from above while falling | Enemy becomes defeated; player bounces upward; lives do not decrease. | Score increases by 50. | Enemy is no longer active/drawn as live enemy. |
| Intersect enemy from side while not invulnerable | Lives decreases by 1; player respawns. | Lives decreases by 1; status remains `playing` unless lives reaches 0. | Player returns to spawn and enemy remains unless separately stomped. |
| Damage while lives is 1 | Status becomes `game-over`; lives becomes 0. | `Status: game-over`, `Lives: 0`. | Player no longer progresses from movement input until restart. |
| Intersect goal | Status becomes `won`; score increases by 100. | `Status: won`; score includes the 100 point goal bonus. | Goal/flag area is reached in the visible frame before win. |
| Press `R` or click Restart | New level state is created; transient input is cleared. | `Status: ready`, `Score: 0`, `Lives: 3`, `Coins: 0`. | Player is back at spawn and collected/defeated objects are reset. |

Collision priority is part of the contract:

1. Movement and platform collision resolve before rule checks.
2. Falling below the world applies damage before coin, enemy, or goal checks for that tick.
3. Coin collection happens before enemy collision so a coin already touched in that tick is not lost.
4. Enemy collision distinguishes stomp from side hit using player downward velocity and relative vertical position.
5. Goal check runs after collision and score updates; reaching the goal must not erase already-earned score.

## Required Scryer Model

The generated `.scryer/model.scry` must include:

- C4 nodes for the app, React shell, HTML Canvas game surface, game loop, engine, physics, renderer, level data, and source model.
- Flows for start, play tick, collect coin, enemy collision, reach goal, and restart.
- Diagrams:
  - game loop flowchart
  - player state machine
  - module/class UML
  - keyboard-to-render sequence diagram
  - collision decision flowchart
- `diagramRefs` linking diagrams to C4 nodes, flow steps, and source file patterns.

## Diagram Sufficiency Contract

Each diagram must be detailed enough to audit real behavior against code. A diagram that only restates a module name or a single happy path is not sufficient.

| Diagram | Required behavior/detail coverage | Required refs |
|---|---|---|
| Game loop flowchart | Keyboard input, `requestAnimationFrame` tick, `updateGame`, movement, platform resolution, coin collection, enemy collision, goal check, camera update, HTML Canvas game surface render, HUD update. | At least one C4 node ref, one `flowStep` ref from play tick, and one source ref to `src/game/game-engine.ts` or the equivalent update module. |
| Player state machine | `ready`, `playing`, `won`, `game-over`, restart from terminal states, damage with remaining lives, damage with zero lives, and clean playing loop events such as coin collection/stomp. | At least one flow or flowStep ref covering play/update behavior and one source ref to the status/type or state transition code. |
| Module/class UML | `App`, `GameCanvas`, game loop hook, engine/update module, physics/collision module, renderer, level data, and shared types; dependency arrows must match imports or direct calls in code. | C4 node refs for the React shell, HTML Canvas game surface, engine, and physics areas, plus source refs to the implementation files named by the diagram. |
| Keyboard-to-render sequence | Human focus, keydown/keyup, input state derivation, update tick, physics/rules call, render call, React HUD update. | At least one flowStep ref for keyboard input and one source ref to the game loop/input module. |
| Collision decision flowchart | Fall damage, coin pickup, enemy stomp, enemy side-hit damage, goal win, and the ordering between these checks. | FlowStep refs for enemy, coin, and goal flows plus source refs to the collision/rules module. |

All required source refs must use project-relative safe patterns. If code is moved or behavior ownership changes, the C4 node, flow step, diagram source, and `diagramRefs` must be updated in the same repair pass.

## Live Verification

The live test must:

- Start a real Vite dev server.
- Open the real game page in Chromium.
- Focus the playable HTML Canvas game surface.
- Use keyboard input to move, jump, die/restart, collect coins, and win.
- Verify the HTML Canvas game surface is not blank.
- Verify HUD state after each meaningful action.
- Verify the generated `.scry` has diagrams and refs, and does not persist render output.

The live test must follow this minimum human-like scenario in one browser session:

1. Start the real Vite dev server and open the real page in Chromium.
2. Focus the playable HTML Canvas game surface and assert the initial HUD is `Status: ready`, `Score: 0`, `Lives: 3`, `Coins: 0`.
3. Capture an HTML Canvas game surface screenshot or pixel probe and assert the surface is not blank.
4. Hold Right or `D` until the player visibly moves; assert `Status: playing` and that the HTML Canvas game surface or player position changed.
5. Press Jump while moving; assert the player leaves the ground and later lands without losing a life.
6. Move to the first reachable coin; assert `Coins: 1`, `Score: 10`, and the coin disappears from the HTML Canvas game surface.
7. Trigger enemy side-hit damage once; assert `Lives: 2`, `Status: playing`, and the player respawns near spawn.
8. Press `R`; assert `Status: ready`, `Score: 0`, `Lives: 3`, `Coins: 0`, and the player is back at spawn.
9. Progress to an enemy stomp; assert score increases by 50 without losing a life and the enemy becomes defeated.
10. Progress to the goal; assert `Status: won` and score includes the goal bonus.
11. Inspect `.scryer/model.scry`; assert it has the required C4 nodes, flows, diagrams, and `diagramRefs`, and does not contain persisted SVG, PNG, diagnostics, `rendererVersion`, or `sourceHash`.

If the current level geometry makes any step above impossible, the level or controls must be changed and the C4 model, flows, diagrams, and refs must be updated before the live test can pass.

## Completion Criteria

- Design doc exists.
- React game runs locally.
- `.scryer/model.scry` describes actual code and contains linked diagrams.
- Live Playwright test passes by interacting with the real game.
- Any gameplay bug found during live testing is fixed in code. If the fix changes game rules, state transitions, module ownership, flow steps, diagram-described behavior, or source file references, the same repair must update `.scryer/model.scry`, affected diagram source, and affected `diagramRefs`. Pure visual tuning that does not change those items may leave the model unchanged only when the live evidence explicitly says why.
