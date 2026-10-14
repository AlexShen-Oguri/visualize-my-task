# 案例 06：计划按项目实际位置读取

合成项目「岸线素材架」已经开始开发。它没有根目录 PLAN.md，文件名与所在目录也不决定文档用途。本 README 是这个案例的来源约定：

| 实际来源 | 权威用途 | 看板读取方式 |
| --- | --- | --- |
| spec/implementation.md | 当前任务、依赖与四种状态 | --plan spec/implementation.md |
| design/requirements.md | 产品规格与验收标准，未记录实际任务进度 | --spec design/requirements.md |
| notes/history.md | 已发生的改动记录 | --changelog notes/history.md |

从 skill 目录运行：

```sh
node scripts/board.mjs --root examples/cases/06-source-layout --plan spec/implementation.md --spec design/requirements.md --changelog notes/history.md --port 0
```

来源选择由使用 skill 的开发代理读取项目约定后完成；运行器不会解释 README，也不会递归扫描并把所有 Markdown 当作计划。

观察点：只有三个任务节点，SRC-02 正在开发，SRC-03 是下一步。规格文档里已勾选的验收标准只表示标准经过讨论，既不会新增任务，也不会把 SRC-01 的待验收改为已验收。

spec-only 子目录演示只有产品规格、尚未整理任务的项目。它需要显式 --spec docs/product-brief.md；打开后显示规格来源，任务为空，读取过程不创建 plan.md。
