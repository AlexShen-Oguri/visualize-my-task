<p align="center">
  <img src="docs/images/logo.png" alt="Visualize My Task logo: a route connecting task nodes" width="112">
</p>

<h1 align="center">Visualize My Task</h1>

<p align="center"><strong>“See the plan. Know your next move.”</strong></p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

**Turn your Markdown development plans into a clear map of what to do.**

See what is in progress, what comes next, and what still needs acceptance. Keep new tasks connected to the original plan as your project grows.

`Codex Skill` · `Chinese / English` · `Runs locally` · `No third-party runtime dependencies`

[Download](https://github.com/AlexShen-Oguri/visualize-my-task/releases/tag/v1.0.0) · [Quick start](#quick-start) · [Screenshots](#screenshots) · [Example cases](visualize-my-task/examples/cases/README.md)

![An actual task map showing three development rounds, the current added task, and parallel branches](docs/images/overview.png)

*Actual browser screenshot using a bundled synthetic example. Both added tasks sit between the first and second rounds; only required work blocks the second round. The screenshots on this page show the Chinese interface.*

## Keep up as the plan grows

When you develop with AI, plans keep changing: a fix appears between two planned rounds, another check is added, and release work follows. Even after reading the documents, you still need to work out where you are—and whether “implemented,” “tested,” and “accepted” mean the same thing.

Visualize My Task brings those records into one map. Keep using your project's Markdown files. Codex maintains the plan within the development work you have authorized, and the board follows saved changes.

## What you can see

| What you need to know | How the board helps |
| --- | --- |
| **What needs attention now** | Highlights the current task and a next step supported by the records. Locate tasks, zoom, browse sections, or search. |
| **Where an added task belongs** | Distinguishes the main route, required branches, and parallel branches. Map placement and blocking dependencies are recorded separately; existing task IDs can stay. |
| **Whether passing tests means the work is finished** | Shows development, automated verification, user acceptance, and delivery independently. A task can pass its tests while still awaiting acceptance and delivery. |
| **How development, checks, and release work connect** | Switch between development, security review, and release maps. Follow prerequisites across maps and retain the candidate version scope. |
| **Whether your existing documents will fit** | Uses your actual plan, specification, and history locations. Supports task tables, checklists, custom file paths, and Chinese or English interface text. |

When the records do not establish a relationship, the board keeps it unknown or shows a notice. It does not turn an entire capability list into an assumed development sequence, or infer implementation progress from checked specification items.

## Screenshots

All five screenshots on this page are actual browser captures of the current version, using bundled synthetic cases. They contain no private project records. Click an image to open the full-size version.

### Implemented and tested can still mean awaiting acceptance

![Four independent task states: development done, automated verification passed, user acceptance pending, and not yet delivered](docs/images/task-details.png)

`P-01` is implemented and has passed automated verification. User acceptance and delivery remain separate records. Passing tests or pushing code does not automatically mark the task as accepted.

### Release work retains its prerequisites across maps

![A release task showing prerequisites from development and security review, plus its candidate version scope](docs/images/workstreams.png)

`REL-01` waits for both a feature task and a security review. Those dependencies stay visible in the release map; select a prerequisite to open its map. `v0.6.0-rc1` is the example's candidate version.

### Start with reference material when there is no plan yet

![A project with specifications only, showing an empty task state and the source reference panel](docs/images/spec-reference.png)

If a project only has specifications, you can read its original requirements and acceptance criteria. Checked specification items do not become completed tasks. Opening the board for an existing project does not automatically create a plan.

### Check the current task on your phone

<img src="docs/images/mobile.png" alt="Actual browser capture at a 390-pixel mobile viewport, showing the current added task and its independent states" width="320">

The mobile layout keeps map browsing and task details available, including the current task, its sources, and its states. This capture uses a 390-pixel browser viewport.

## Quick start

After installation, ask Codex from your project:

```text
$visualize-my-task Open this project's development board.
```

1. **Choose the right records.** Codex checks the project's plans, specifications, history, and relationship documents, using their actual locations.
2. **Open the board.** Browse the current task, next step, added branches, and independent states.
3. **Continue developing.** Maintain the original plan within the work you have authorized. The board checks saved changes in the selected documents every two seconds.

You can also describe your situation directly:

```text
$visualize-my-task Show what is in progress in this plan and what comes next.

$visualize-my-task The added tasks are already recorded in the plan. Organize their relationships from the existing evidence and open the board.

$visualize-my-task Establish and maintain a plan for this new project from day one.
```

**The local service is read-only.** Codex or a separate helper script maintains documents within the authorized scope. The board service does not listen to conversations, call a model, or change task states for you.

## Installation

Requires **Node.js 20+** and a local browser. There are no third-party runtime dependencies to install and no build step.

1. Download `visualize-my-task-1.0.0.zip` from the [v1.0.0 Release](https://github.com/AlexShen-Oguri/visualize-my-task/releases/tag/v1.0.0). This private repository requires access permission.
2. Extract it and place the complete `visualize-my-task/` folder inside `~/.codex/skills/`. Keep a backup first if that folder already exists.
3. Invoke `$visualize-my-task` in your target project.

If you clone the repository, install the **skill subdirectory inside it**. You can also preview the bundled example from the repository root:

```sh
git clone https://github.com/AlexShen-Oguri/visualize-my-task.git
cd visualize-my-task
npm start
```

The terminal prints the local address. The default preview uses a synthetic case; stop the process to stop the service.

## Projects it works with

| Your project | What you see |
| --- | --- |
| A plan organized into rounds, with work added during development | The original main route, with required tasks or parallel branches attached according to the records. |
| A loose plan with only near-term goals | Tasks grouped by topic, highlighting recorded current and upcoming work. |
| No plan yet, or only a change history | An empty task state or change history, without invented progress. |
| Development, checks, and release work happening together | Shared task identities, separate maps, and prerequisites tracked across them. |
| A new project, or documents in custom directories | Plan maintenance from day one, or existing custom locations for implementation documents and specifications. |

The interface can follow the project's Chinese or English language. Task names, descriptions, and original source text stay unchanged. Explore the [case index](visualize-my-task/examples/cases/README.md) and [language examples](visualize-my-task/examples/cases/07-language/README.md).

## Verification record

The following checks were completed before the `v1.0.0` release. The screenshots on this page were captured separately from the current running version, checking five display scenarios and desktop and mobile viewports.

| Check | Result |
| --- | --- |
| Automated regression tests | 101 passed. |
| HTTP, input boundary, and browser security checks | 165 passed. |
| Independently extracted installation package | 101 tests and 12 CLI cases passed, including paths with Chinese characters and spaces. |
| Packaging filters | 3 integration tests passed, covering exclusion of private extra files and rejection of symlinks and missing files. |

These results cover the bundled cases and the boundaries checked; they do not establish compatibility with every project format or browser. See the [release notes](docs/releases/1.0.0.md) for version details.

## More ways to use it

<details>
<summary>Choose your own plans, specifications, and history manually</summary>

```sh
node ~/.codex/skills/visualize-my-task/scripts/board.mjs \
  --root "/path/to/project" --plan "docs/implementation.md" \
  --spec "docs/requirements.md" --changelog "docs/history.md" \
  --lang auto --check
```

After checking the sources and states, replace `--check` with `--port 0` to start the board. You can repeat `--plan`, `--spec`, `--changelog`, and `--relations`; paths resolve relative to `--root`. Use `--lang en` or `--lang zh` to override the interface language.

A filename does not determine a document's role: `spec/implementation.md` can be an implementation plan, with specifications and history kept as reference material. See [project sources](visualize-my-task/references/project-sources.md), [task relationships](visualize-my-task/references/task-relations.md), and the [new project workflow](visualize-my-task/references/new-project.md).

</details>

<details>
<summary>Local operation and privacy boundaries</summary>

Normal startup binds to `127.0.0.1`, serves fixed read-only GET / HEAD routes, and validates Host and Origin. Do not expose the service to the public internet through a proxy or tunnel. The local board displays the original text of selected documents; choose only material you intend to show.

If reading fails, the service keeps the last successful snapshot and marks it stale. That in-memory snapshot disappears after a restart. The service reads at most 16 sources, with a limit of 2,000,000 bytes and 2,000 records per source. See [SECURITY.md](SECURITY.md) for reporting security issues.

</details>

<details>
<summary>Run tests and build an installation package</summary>

```sh
npm run check
npm test
npm run test:package
npm run package
```

Packaging requires Python 3 and Node.js 20+. The installation package includes skill runtime resources, tests, workflow references, and synthetic cases. README images stay in the repository and are excluded from the installation ZIP. Private development records, old UI versions, and verification snapshots remain excluded. The font license is in [OFL-BarlowCondensed.txt](visualize-my-task/assets/OFL-BarlowCondensed.txt).

</details>
