---
name: visualize-my-task
description: Use when a user wants a local development dashboard from Markdown plans, specs or changelogs (开发进度看板、实时开发排程), needs added tasks attached to a workflow, or adopts the board from a new project's start. Sources follow the project's actual planning locations. Not for product analytics or dashboards sourced only from GitHub Issues.
metadata:
  version: "1.0.0"
---

# Visualize My Task

Show documented development as a local operation map. Node 20+ scripts reread Markdown every two seconds; no packages, runtime model, chat listener, or write API are needed. Task records remain authoritative for four separate states: development, verification, human acceptance, and delivery.

## Prepare and open

1. Inspect the project root, user's chosen sources, actual table headers, and nearby prose. Follow the project's declared planning locations: user-specified files first, then project instructions and README/documentation links, with conventional filenames only as fallback. Read [project-sources.md](references/project-sources.md) for specs, custom paths, or multiple planning documents. A file named `spec/implementation.md` can be the task authority; `PLAN.md` is not required. Classify by content: implementation tasks, normative requirements, or history. Distinguish an ongoing project with missing records from a user starting a new project with this skill; an absent plan alone cannot establish that distinction.

   For a new project adopting this skill from the start, establish lowercase `plan.md` from the user's goal and selected tasks before development. Maintain it as work changes. Read [new-project.md](references/new-project.md) for initialization and the change-record contract. Reuse any existing authoritative plan instead of creating a competing file. The new-project request authorizes this setup; opening an ongoing project without a plan still uses the empty/history view unless planning is requested.
2. Reconcile task relationships before launch. Read [task-relations.md](references/task-relations.md) when tasks were added later, different workstreams coexist, or the plan is informal. Separate **visual attachment** (`After`/`Before`) from **blocking prerequisites** (`Dependencies`). Explicit task metadata wins; use prose such as “finish this before round two” as evidence. Dates, titles, Git order, and file position alone do not establish dependencies. Leave uncertain relationships unplaced and visible.

   When opening or refreshing, prepare relation-only `BOARD.md` from clearly documented relationships as a derived view input; preserve existing explicit metadata and include its evidence. If the project is read-only, save it in the task's artifact directory and pass `--relations` explicitly. This does not change the original plan, create new tasks, or infer missing states. New planning or updates to original task records require authorization from that planning/development task. Keep each task's label and states in its original plan; relation rows reference its stable ID. During authorized development, maintain these relationships when recording new work. Do not create a new plan just to open the board.
3. Run the parser using this skill directory, independently of the target project:

   ```sh
   node "<skill-dir>/scripts/board.mjs" --root "<project-dir>" --plan "docs/PLAN.md" --lang auto --check
   ```

   Inspect source errors, representative states, relation warnings, and actual current/next work. Use `--tasks tables` if detailed checklists repeat the table's work. Select an actual task document with `--plan`, and normative specifications with repeatable `--spec`, regardless of their filenames. A prose-only spec is a valid reference source, with no invented task progress. A prose-only file explicitly supplied as a task plan reports its unsupported format without changing it.

   Follow the project's primary language for interface labels and accessible names. `--lang auto` (the default) resolves an explicit project declaration before selected task documents, then specifications/history, with Chinese as the uncertain fallback. A user-selected `--lang en` or `--lang zh` wins. Inspect other project language conventions and pass the matching override when needed; read [project-sources.md](references/project-sources.md#interface-language) for supported declarations and precedence. Confirm `snapshot.language` is `en` or `zh`. Task names, recorded states, details, specs, history and source excerpts stay in their original language.
4. Start with the same source arguments plus `--port 0`, capture the printed URL/PID/root/sources, fetch `/api/plan` and the page, and open the URL in the host browser panel. Keep its managed terminal alive. Verify an existing board's sources before reusing it; an occupied port is not permission to stop another process. Stop the recorded process with Ctrl+C when requested. A sandbox's `EPERM` bind/fetch failure requires that host's normal execution approval path.

## Sources and graph semantics

Task tables accept a name/feature column, optional explicit ID and four state columns; checklists accept `- [x]`/`- [ ]` under headings. Common headers include `任务`, `功能 / 需求`, `轮次`, `开发状态`, `自动验证`, `用户验收`, `交付`, `Task`, `ID`, `Status`, `Tests`, `Acceptance`, and `Delivery`. A checkbox changes development only. Missing states are `未记录`; unknown labels and extra columns remain visible. Code fences and comments do not create tasks. Table rows need the header's exact cell count; write empty cells explicitly.

A `轮次` ID header identifies a visual main route. Other unordered tables/checklists remain grouped unless relationship metadata says otherwise. Document order never becomes a chain of blocking dependencies. Explicit dependency cells accept IDs separated by commas, semicolons, or whitespace; blank/`—`/`none` means independent. An absent dependency field is unknown. Missing, ambiguous, or cyclic references produce warnings and cannot establish next work. Failed verification or blocked development does not unlock dependents. Current work comes from explicit development-in-progress states; next work requires supported prerequisite information.

Development, security, and release views share task identities and preserve cross-view dependencies. Audits and releases retain their recorded version/scope. A change in scope needs new evidence rather than silently reusing an old result.

Repeat `--plan`, `--spec`, `--changelog`, or `--relations` for multiple sources. All accept project-specific Markdown paths; resolve them against `--root`. `--tasks all|tables|checklists` selects task records, not specifications/history/relationship rows. Explicit task/spec/history flags choose the sources; fallback discovery is not the project's authority. With no such flags, the launcher checks conventional plan/changelog paths and root/docs `SPEC.md` or `spec.md`. Conventional `BOARD.md` is also discovered beside selected plans and at the root; explicit `--relations` chooses relation sources instead. Inspect selected sources to avoid mixing private/public records or obsolete/current specs. There is no recursive runtime project scan.

Spec sources are shown as reference sections in the sources panel. Their checked requirements, test descriptions or acceptance criteria do not establish implementation, test execution, acceptance or delivery. Current progress comes from documented task facts. Keep each physical file in one source role; do not register the same mixed document as both plan and spec.

## Informal and absent plans

For an informal plan, group capabilities and identify only the current goal plus the nearest two or three supported steps. Do not turn the entire feature catalog into a numbered roadmap. With no usable records show `no-plan`; history without current tasks shows `history-only`; normative specs without task records show `spec-only`. The agent can propose a small task draft from user goals and project records, and save it when planning is authorized. Git history proves past changes, not planned work or acceptance. Undocumented progress stays unrecorded.

New-project initialization is a separate case: keep a current goal, stable task table and dated `## 计划变更记录` in `plan.md`. The parser exposes that section (or `## Plan changes`) as history, without counting historical checklists or task snapshots again. During authorized development, update task facts and append changed IDs, reasons and relationships after each meaningful change; the read-only server does not perform these writes or monitor conversations.

## Try the situations

Self-contained synthetic cases ship in [examples/cases/README.md](examples/cases/README.md): ordered existing work with added branches, informal existing work, a project without a plan, security/release workstreams, new-project initial/updated snapshots, and custom planning locations with specification references. [Language examples](examples/cases/07-language/README.md) cover English source documents, explicit overrides and an English project declaration with Chinese tasks. Use their stated expectations to check the map; examples are simulated evidence, not delivered application work.

## Runtime boundaries and verification

The server binds `127.0.0.1`, serves fixed GET/HEAD routes, validates Host/Origin, and does not expose raw files or accept writes. This workflow does not authorize publication. Each source retains its last good snapshot marked stale after a read failure; first-read failures stay errors. Restarting loses that in-memory fallback. Limits are 16 files, 2,000,000 bytes and 2,000 records per file.

After changes, run `node --test "<skill-dir>"/scripts/*.test.mjs`. Exercise new input shapes and the rendered board in an isolated project before using live development records.
