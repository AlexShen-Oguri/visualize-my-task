# 仅有产品规格的项目

本合成项目的当前权威文档是 docs/product-brief.md，用于记录产品范围和验收标准。项目尚未拆分实施任务，没有 plan.md，也没有开发或验收完成证据。

从 skill 目录运行：

```sh
node scripts/board.mjs --root examples/cases/06-source-layout/spec-only --spec docs/product-brief.md --port 0
```

观察点：显示规格来源及尚未整理任务的状态，不能把验收标准变成任务或把文档中的勾选当作完成状态。预览不会创建计划文件。
