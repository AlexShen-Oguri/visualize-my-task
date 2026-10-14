# Start a project with plan.md

Use this workflow when the user is starting a new project with the board, or explicitly asks to initialize its plan. An ongoing project without a plan remains an existing project; viewing it does not authorize reconstructing approved work or inventing history.

## Establish the first plan

1. Read existing project instructions and look for the authoritative implementation records, including private/nested plans and task documents named spec. Follow [project-sources.md](project-sources.md) for project-specific locations. Reuse an existing task authority when present; preserve its filename and facts. A normative spec alone supplies requirements, not a task plan; the new plan may link back to it.
2. Use the user's goal and already selected tasks. If those are absent, clarify the immediate goal rather than inventing a roadmap. A small current goal and two or three steps are enough; preserve a fuller approved plan when supplied.
3. Create lowercase `plan.md` with the bundled helper, or equivalent file tools when needed:

   ```sh
   node "<skill-dir>/scripts/init-plan.mjs" --root "<project-dir>" \
     --title "离线书签工具" --goal "在本机保存和检索书签" \
     --task "建立书签数据结构" --task "完成新增与检索界面"
   ```

   It writes exclusively, returns JSON with `created` and `path`, and preserves existing conventional plans, even when invoked again. `created:false` means inspect and reuse the returned authority; it is not permission to force overwrite. No installation, project configuration change, database or runtime model is required.
4. Run `board.mjs --root "<project-dir>" --plan plan.md --check`, inspect task count/history/states, then launch normally. Use the existing filename instead when initialization returned an existing plan.

The helper supplies stable `P01`, `P02`… IDs and main-route metadata. Initial development is `未开始`; verification, human acceptance and delivery remain `未记录`. Order is visual, not an invented blocking dependency.

## Maintain the same file during development

Keep three parts in one authoritative plan:

| Part | Required content |
| --- | --- |
| Current goal | The selected scope and any explicit exclusions needed to interpret it |
| Current task table | Stable IDs, labels, route/origin/workstream and four independent status fields; relationships may stay in BOARD.md |
| `## 计划变更记录` | Dated records of changed IDs, what changed, why, and the supporting decision/result |

Before continuing development, read the plan. When requirements, implementation state, verification, acceptance, delivery or task relationships change, update the affected rows and append a compact record in the same work session. Record actual verification evidence and its version when available. User acceptance is recorded only after an explicit user confirmation.

Keep IDs when tasks move or labels change. For a supplement to an approved flow, retain the original main-route tasks and give the added task a new unused ID, `Origin=added` and `Route=branch`. Record its supported `After`/`Before` location and actual prerequisites separately. A required branch still blocks its downstream task through Dependencies; it does not need to become another original main stage. If the user explicitly revises the main route, record that decision and preserve the existing IDs. Preserve canceled/superseded work in the change record instead of pretending it was completed. Avoid turning every small code edit into another task.

For example, after a user inserts a normalization task between P01 and P02:

```markdown
## 计划变更记录

| 日期 | 变更 | 涉及编号 | 内容与依据 |
| --- | --- | --- | --- |
| 2026-10-14 | 新增 | P04、P02 | 用户要求先完成P04再继续P02；P04挂接于P01之后，P02增加P04作为前置条件 |
```

The current task appears once in the task table; the record explains the change. This explicit history section is excluded from current-task parsing, including checklists and old task snapshots inside it. Its text appears in the board's history view. Do not pass the same plan again as `--changelog`.

The server remains read-only and rereads selected files every two seconds. The development agent maintains the plan; no background process listens to chats. An existing board with no selected plan must be reopened after its first plan is created.
