# Select the project's planning sources

The source's purpose and authority matter more than its filename. A project may use `spec/implementation.md`, `docs/superpowers/plans/<topic>.md`, a roadmap, a task checklist or another Markdown location. Do not require a new PLAN merely to fit the launcher.

## Find current authority

1. Use paths supplied by the user. Read project instructions and README/documentation indexes for the project's own planning locations and current feature/version.
2. Follow those references and inspect headings, task structure and scope. Use a bounded filename search with `rg --files` in the relevant documentation directories if the location is not yet clear; examples include `spec/`, `specs/`, `docs/specs/`, `docs/plans/`, `docs/superpowers/` and `.specify/`. These are search hints, not mandatory locations.
3. Select documents relevant to the user's current scope. Multiple active specs/plans can be supplied explicitly. Do not select the newest dated file or every spec automatically: proposals, archived designs and unrelated releases may coexist.
4. Classify the selected content and choose source roles below. If records conflict, retain source evidence and resolve the specific conflict; tests/logs cannot override missing human acceptance.

Conventional launcher discovery is a fallback for common layouts. The agent reads project context and passes actual paths; the runtime does not interpret README links or search the entire repository.

## Source roles

| Role | Use | CLI |
| --- | --- | --- |
| Current task authority | Explicit implementation tasks and factual status fields; filename may include spec | `--plan <actual-path>` |
| Normative reference | Goals, architecture, requirements, acceptance criteria, design decisions | `--spec <actual-path>` |
| Historical evidence | Recorded changes and past results | `--changelog <actual-path>` |
| Relationship supplement | Stable task IDs, placement, actual prerequisites and supporting evidence | `--relations <actual-path>` |

For example:

```sh
node "<skill-dir>/scripts/board.mjs" --root "<project-dir>" \
  --plan "spec/implementation.md" --spec "design/requirements.md" \
  --changelog "notes/history.md" --port 0
```

Repeat flags for relevant documents in multiple locations. Explicit task/spec/history flags disable conventional source selection. Read the `--check` output to confirm selected paths, roles and source state. Files outside the project may be supplied explicitly when needed; do not silently mix private and public sources.

## Interface language

The board follows the project's primary language, independently of source selection. Set `--lang auto` (the default), `--lang en`, or `--lang zh`. The snapshot's `language` field always resolves to `en` or `zh`; it controls interface labels, controls, empty/error states and accessible names. It does not translate source content or alter task facts.

Use this priority:

1. An explicit `--lang en` or `--lang zh` override, including the user's stated preference.
2. The project's declared primary language. The runtime reads bounded root `package.json` fields `i18n.defaultLocale` / `defaultLocale`, and README declarations such as `Primary language: English` or `项目主语言：中文`. A supported English declaration wins even when selected task documents are Chinese.
3. Language evidence in the selected current task documents. Specifications and history are fallback evidence when task documents are inconclusive or absent.
4. Chinese when the available evidence remains unclear.

The runtime does not infer the project's language from the browser, operating system, project name or the conversation. When a project declares its language in another convention, inspect that evidence and pass `--lang en` or `--lang zh`; the runtime does not recursively search or interpret arbitrary project instructions. Keep that override when starting or refreshing the same board. Confirm the resolved `language` in `--check` or `/api/plan` before opening it.

For example, this uses an English interface even when `docs/tasks.md` is written in Chinese:

```sh
node "<skill-dir>/scripts/board.mjs" --root "<project-dir>" \
  --plan "docs/tasks.md" --lang en --port 0
```

Task labels, status values, details, specifications, history and source excerpts remain verbatim. A Chinese interface can therefore show English task text, or an English interface Chinese task text. See the runnable [language examples](../examples/cases/07-language/README.md).

## A spec is not completed work

`--spec` accepts prose Markdown and preserves reference sections with source lines. It does not create current tasks, even if the text contains checked checklists or a sample status table. “Acceptance criteria” describes what must be true; it is not a record that a human accepted the application. The page's sources panel exposes the spec text; it remains independently live or stale.

If a file named spec is actually a clean implementation task document, use it as `--plan`. Inspect mixed documents carefully: a checklist under requirements or a fenced example is not implementation evidence. `--tasks tables` can select genuine task tables while excluding checklist detail. When the source cannot be consumed without mixing criteria/examples with real work, extract only its explicitly selected implementation tasks into a derived view document in the task artifact directory, with original path/heading/line references in each detail. Include only source-supported state facts; missing dimensions remain `未记录`. Pass the derived task document as `--plan` and the original as `--spec`. Refresh the derived view when the agent reconciles changed source records; the server does not perform semantic extraction.

When a spec contains only desired behavior, keep it as reference. Propose task decomposition when planning is requested; do not fabricate approved implementation steps or current progress. A spec-only project is a valid view, not an unreadable-plan error.

## Keep project conventions

Maintain future task changes in the selected authority and its relationship supplement. Do not rename or move existing plans/specs, add a competing plan, or change project instructions just to open the board. A new project adopting the skill from day one still establishes `plan.md` when it has no existing task authority; its plan can link to the original specs. See [new-project.md](new-project.md).
