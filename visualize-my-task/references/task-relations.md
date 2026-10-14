# Task relationships

Use task-table columns directly during authorized plan maintenance, or prepare conventional `BOARD.md` alongside the plan as derived view input when opening the board. The agent interprets clearly documented relationships, records supporting evidence, and preserves existing explicit metadata. For a read-only project, keep the sidecar in the task artifact directory and pass `--relations`. The server reads both; it does not interpret prose or listen to conversations.

## Relation table contract

A sidecar row describes an existing task. It contains **ID plus relation fields**, never another task name, status, or duplicate task. IDs must be stable and unique within their source; use `Source` to select the target plan if IDs repeat across files. Unknown targets remain warnings, not invented tasks.

Generated row numbers for checklists and tables without an ID column are display labels, not stable reference IDs. Record an explicit ID in an authorized task-table update before attaching relationship metadata; opening the board alone does not authorize rewriting a checklist.

| Column (Chinese alias) | Meaning |
| --- | --- |
| ID | Existing task ID, required |
| Source / 任务来源 | Target plan path relative to project root; optional if ID is unique |
| Route / 路线 | `main`, `branch`, `grouped` (`主线`, `支线`, `分组`) |
| Origin / 计划来源 | `planned`, `added` (`原计划`, `追加`); unknown stays unknown |
| Workstream / 工作类型 | `development`, `security`, `release` (`功能开发`, `安全审计`, `发布交付`) |
| After / 接在任务后 | One task ID anchoring visual placement after that task |
| Before / 汇入任务前 | One task ID anchoring visual placement before that task |
| Dependencies / 前置任务 | Actual blocking prerequisite IDs; an empty cell explicitly means independent |
| Scope / 适用版本 | Recorded version, candidate build, or audit scope |
| Evidence / 关系依据 | Compact source reference or explicit user decision supporting the relation |

A column applies to every row: if the sidecar is only for placement, **omit the Dependencies column entirely**. A blank dependency cell is an explicit independent task and overrides its previous prerequisites; it is not “leave unchanged.” The ATLAS demo therefore keeps prerequisites in PLAN.md and omits that column from BOARD.md.

`After` and `Before` affect placement, not readiness. If a branch must complete before a main task, the **main task's** dependency cell must include that branch ID. A branch's `Dependencies` names what the branch waits for, not what waits for it. Keep existing prerequisites when adding one. Unclear references remain unplaced; never resolve ambiguity by choosing the closest row. Conflicting metadata needs source clarification rather than silently changing task state.

## One example: two different added branches

Original PLAN contains tasks `R1`, `R2`, `FIX`, and `POLISH`; their labels and states stay there. The recorded decision says FIX must finish between rounds one and two, while POLISH may proceed independently.

```markdown
| ID | Route | Origin | Workstream | After | Before | Dependencies | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | main | planned | development | | | — | Approved first round |
| R2 | main | planned | development | R1 | | R1, FIX | Continue only after FIX |
| FIX | branch | added | development | R1 | R2 | R1 | Follow-up decision after round one |
| POLISH | branch | added | development | R1 | R2 | — | Optional parallel improvement |
```

Both added tasks appear in the same interval. Only FIX blocks R2. A new task discovered during an audit can stay in development with a link to its security prerequisite; changing views never duplicates it. Record the audit/release `Scope` explicitly when supplied; a generic “audit workflow configured” task is not proof that an application audit ran.

## Before recording relationships

For an ordered roadmap, preserve the main sequence and attach additions at supported anchors without renumbering existing rounds. For a capability catalog, keep items grouped and extract only explicitly selected follow-up work. For no plan, present the empty state; an authorized planning draft should contain the current goal and two or three concrete steps with unknown states left unrecorded. A board-opening request alone does not authorize that draft.
