# 六种项目情况的可运行案例

所有名称、日期、状态、版本与交付标记均为合成测试数据，不包含真实项目或私人记录。前四组与第六组模拟已有项目；第五组模拟项目从第一天使用本 skill。

| 案例 | 项目阶段 | 要观察的行为 |
| --- | --- | --- |
| 01-structured | 已有分轮计划的项目 | 追加的必要修复与可并行改进都接在第一轮与第二轮之间；只有必要修复阻塞第二轮 |
| 02-adhoc | 已有能力目录、随做随改的项目 | 能力目录保持分组；只给明确选择的近期工作建立依赖 |
| 03-no-plan | 已有应用、尚无计划文档的项目 | 只显示变更历史；不从 README 或旧记录臆造当前任务 |
| 04-workstreams | 同时进行开发、审计与交付的项目 | 三种地图共用任务身份与跨图前置条件；审计范围固定到候选版本 |
| 05-new-project | 新开的项目 | 从第一天保留 lowercase plan.md；追加任务与日期记录不改变原编号 |
| 06-source-layout | 计划和规格存放在自定义位置的已有项目 | 按项目约定选择实际来源，区分实施任务、纯规格与变更历史；另有仅规格子案例 |

## 打开案例

从 skill 目录运行，使用 Node 20 或更新版本，无需安装依赖：

```sh
node scripts/board.mjs --root examples/cases/01-structured --port 0
```

把 root 替换为 02-adhoc、03-no-plan、04-workstreams，或 05-new-project/updated。命令会自动发现现有来源并输出本机预览地址。第三组的 03-no-plan/no-records 可单独打开，检查既无计划也无历史的空态。第五组的 05-new-project/initial 可单独打开，与 updated 对照。

第六组使用 README 明确声明的自定义来源，需要显式传入路径。文件位于 spec 目录并不意味着它只能作为规格；本案例的 spec/implementation.md 实际承载实施任务：

```sh
node scripts/board.mjs --root examples/cases/06-source-layout --plan spec/implementation.md --spec design/requirements.md --changelog notes/history.md --port 0
```

只有规格、尚无实施计划的子案例：

```sh
node scripts/board.mjs --root examples/cases/06-source-layout/spec-only --spec docs/product-brief.md --port 0
```

运行器不会自动解释 README 中的来源声明。使用 skill 的开发代理先读取项目约定，再选择路径与用途；纯规格中的验收标准不作为任务或完成证据。

运行全部案例回归：

```sh
node --test scripts/scenarios.test.mjs
```

manifest.json 给出每组相对 skill 的 root、来源和预期节点数，便于自动启动或校验。阅读和预览不会修改任何案例。
