# work.md｜Hermes × Claude Code × Codex 三 Agent 协作规范

> 适用场景：同一个项目中同时使用 Hermes Agent、Claude Code、Codex 时，用于规定三者的分工、调度、读文件顺序、执行边界、审查流程和交接方式。  
> 核心目标：避免多 Agent 同时乱改、互相覆盖、重复劳动、审查失效、任务发散、素材误删。

---

## 0. 使用方式

建议把本文件放在两个位置：

```text
1. Hermes 的长期工作目录 / workspace 中
2. 每一个具体项目的项目根目录中
```

如果只能放一个位置，优先放在：

```text
Hermes 的工作目录
```

因为 Hermes 是总调度 Agent，需要先读本文件，再决定如何唤起 Claude Code 和 Codex。

每次新项目开始时，Hermes 应该执行以下动作：

```text
1. 读取 work.md
2. 读取或创建当前项目的 TASK.md
3. 判断任务类型
4. 决定本轮由 Claude Code 还是 Codex 执行
5. 把 work.md + TASK.md 的阅读要求写进给执行 Agent 的提示词
6. 禁止 Claude Code 和 Codex 同时修改项目
7. 执行完成后安排另一个 Agent 做审查
8. 汇总 CHANGELOG.md / REVIEW.md / HANDOFF.md
```

---

## 1. 最重要的一句话

```text
Hermes 管任务，Claude Code 做执行，Codex 做审查。
任何时候都不要让三个 Agent 同时改同一个项目。
```

如果任务风险很高，则改为：

```text
Hermes 管任务，Codex 先出方案，Claude Code 再执行，Codex 最后审查。
```

---

## 2. 三个 Agent 的核心定位

### 2.1 Hermes Agent：项目经理 / 微信入口 / 总调度 / 记忆中枢

Hermes 负责：

```text
1. 接收用户的原始需求
2. 把模糊需求整理成清晰任务
3. 生成 TASK.md
4. 判断本轮任务类型
5. 生成给 Claude Code 的执行提示
6. 生成给 Codex 的审查提示
7. 记录项目进展
8. 汇总 CHANGELOG.md
9. 汇总 HANDOFF.md
10. 整理项目复盘
11. 沉淀可复用工作流
```

Hermes 不负责：

```text
1. 不直接大规模修改项目代码
2. 不直接重构项目
3. 不作为最终技术审查者
4. 不让 Claude Code 和 Codex 并行修改同一个项目
5. 不在用户未确认时自动合并高风险修改
6. 不删除用户素材
```

Hermes 的默认工作顺序：

```text
用户需求
↓
Hermes 整理需求
↓
生成 TASK.md
↓
选择执行 Agent
↓
执行 Agent 修改
↓
审查 Agent 审查
↓
执行 Agent 修复必要问题
↓
Hermes 汇总复盘
```

---

### 2.2 Claude Code：主力执行者 / 本地施工者

Claude Code 负责：

```text
1. 阅读 work.md
2. 阅读 TASK.md
3. 阅读项目结构
4. 输出执行计划
5. 修改代码
6. 调整 UI
7. 修复 bug
8. 实现交互
9. 更新文档
10. 运行必要测试
11. 更新 CHANGELOG.md
```

Claude Code 不负责：

```text
1. 不做最终独立审查
2. 不擅自扩大需求范围
3. 不跳过计划直接改代码
4. 不同时和 Codex 修改同一批文件
5. 不删除用户素材、图片、视频、字体、源文件
6. 不私自更换整体视觉风格
7. 不私自更换技术架构
8. 不修改 TASK.md 未授权的内容
```

Claude Code 执行前必须先输出：

```text
1. 我理解的任务
2. 我准备查看的文件
3. 我准备修改的文件
4. 可能风险
5. 执行步骤
```

---

### 2.3 Codex：独立审查者 / 技术兜底者 / 高风险执行者

Codex 默认负责审查，不默认执行。

Codex 负责：

```text
1. 阅读 work.md
2. 阅读 TASK.md
3. 阅读当前 git diff
4. 判断任务是否完成
5. 检查是否有多余修改
6. 检查是否有潜在 bug
7. 检查是否破坏已有功能
8. 检查 UI / 交互 / 架构风险
9. 输出 REVIEW.md
10. 给出是否可以交付的结论
```

Codex 默认不直接修改项目。

只有以下情况，Codex 才可以作为执行者：

```text
1. Claude Code 多轮修复失败
2. 项目存在复杂 bug
3. 涉及架构级问题
4. 用户明确指定 Codex 执行
5. Codex 审查发现严重问题，需要直接修复
```

Codex 作为审查者时必须遵守：

```text
只审查，不修改。
只基于 work.md、TASK.md 和当前 git diff 给结论。
不要发散新需求。
不要重新设计整个项目。
```

---

## 3. Hermes 如何让其他两个 Agent 也读 work.md

### 3.1 如果 Hermes 可以自动唤起 Claude Code / Codex

Hermes 在调用 Claude Code 或 Codex 时，必须把以下内容放进提示词开头：

```text
请先阅读项目中的 work.md 和 TASK.md。
如果你无法读取 work.md，请停止执行并要求我提供文件内容。
阅读完成后，先用不超过 5 条 bullet 总结你在本轮任务中的角色、边界和禁止事项。
在完成这个总结之前，不允许修改任何文件。
```

### 3.2 如果 Hermes 不能自动唤起 Claude Code / Codex

Hermes 应该输出可复制的提示词，让用户手动粘贴给 Claude Code 或 Codex。

Hermes 不可以假装自己已经唤起了其他 Agent。

Hermes 必须明确说明：

```text
我无法直接调用 Claude Code / Codex。
下面是你需要复制给对应 Agent 的指令。
```

---

## 4. 标准项目文件结构

建议每个项目根目录包含：

```text
project/
├── work.md          # 三 Agent 协作规则
├── TASK.md          # 当前任务
├── CHANGELOG.md     # 修改记录
├── HANDOFF.md       # 交接说明
├── REVIEW.md        # Codex 审查结果
├── README.md        # 项目说明
├── src/             # 项目源码
├── assets/          # 素材文件
└── package.json     # 项目配置，若有
```

如果是 Claude Code 项目，可以额外加入：

```text
CLAUDE.md
```

如果是 Codex 项目，可以额外加入：

```text
AGENTS.md
```

但无论有没有 `CLAUDE.md` / `AGENTS.md`，本文件 `work.md` 都是三 Agent 协作的最高优先级规则之一。

---

## 5. 任务开始前的强制检查

任何 Agent 在修改前必须检查：

```text
1. 是否已经阅读 work.md
2. 是否已经阅读 TASK.md
3. 是否知道自己是执行者还是审查者
4. 是否知道本轮允许修改的范围
5. 是否知道本轮禁止修改的内容
6. 是否存在其他 Agent 正在修改
7. 是否存在未提交或来源不明的 git diff
8. 是否有用户素材可能被误删
```

如果有不确定项，必须停止并写入：

```text
HANDOFF.md
```

或者向用户询问。

---

## 6. 同步锁规则：防止多个 Agent 同时修改

为了避免多个 Agent 同时改项目，建议在项目根目录建立：

```text
AGENT_LOCK.md
```

当某个 Agent 开始执行修改时，必须写入：

```md
# AGENT_LOCK.md

## 当前执行 Agent

Claude Code / Codex / Hermes

## 当前状态

executing / reviewing / waiting

## 开始时间

YYYY-MM-DD HH:mm

## 本轮任务

简述当前任务。

## 禁止事项

其他 Agent 不允许修改项目文件，只允许阅读和审查。
```

执行完成后，更新为：

```md
# AGENT_LOCK.md

## 当前状态

idle

## 上一轮执行 Agent

Claude Code / Codex / Hermes

## 完成时间

YYYY-MM-DD HH:mm

## 结果

已完成 / 部分完成 / 失败
```

如果存在 `AGENT_LOCK.md` 且状态不是 `idle`，其他 Agent 不允许修改文件。

---

## 7. 标准协作流程

### 7.1 普通项目流程

适用于：

```text
1. 网页 UI 修改
2. 作品集网站修改
3. HTML 工具修改
4. 提示词平台修改
5. 简单功能修复
6. 文档整理
7. 轻量项目迭代
```

流程：

```text
用户提出需求
↓
Hermes 阅读 work.md
↓
Hermes 生成 TASK.md
↓
Hermes 选择 Claude Code 作为执行 Agent
↓
Claude Code 阅读 work.md + TASK.md
↓
Claude Code 输出执行计划
↓
Claude Code 执行修改
↓
Claude Code 更新 CHANGELOG.md
↓
Hermes 选择 Codex 作为审查 Agent
↓
Codex 阅读 work.md + TASK.md + git diff
↓
Codex 输出 REVIEW.md
↓
Claude Code 修复 Codex 提出的“必须修复”
↓
Hermes 汇总 HANDOFF.md / 最终复盘
```

---

### 7.2 高风险项目流程

适用于：

```text
1. 游戏项目
2. Ren'Py 项目
3. 多页面网站
4. GitHub Pages 线上项目
5. 文件结构重构
6. 复杂交互
7. 数据逻辑修改
8. 大量素材引用项目
```

流程：

```text
用户提出需求
↓
Hermes 阅读 work.md
↓
Hermes 生成 TASK.md
↓
Codex 先阅读 work.md + TASK.md，仅出技术方案，不修改
↓
Hermes 汇总方案
↓
Claude Code 阅读方案后执行
↓
Codex 审查 git diff
↓
Claude Code 修复
↓
Hermes 记录复盘
```

---

### 7.3 两方案 PK 流程

适用于：

```text
1. 不确定 UI 方向
2. 不确定技术方案
3. 不确定交互方式
4. 用户想比较两个 Agent 的思路
```

流程：

```text
Hermes 整理需求
↓
Claude Code 输出方案 A，不修改文件
↓
Codex 输出方案 B，不修改文件
↓
Hermes 对比两个方案
↓
用户选择方案
↓
只指定一个 Agent 执行
```

注意：

```text
此流程中 Claude Code 和 Codex 只允许出方案，不允许同时动手修改。
```

---

## 8. TASK.md 标准格式

Hermes 每轮任务必须先生成 `TASK.md`。

模板：

```md
# TASK.md

## 本轮目标

清楚说明本轮要解决什么问题。

## 背景

说明用户为什么要改，当前项目哪里不满意。

## 当前问题

1. 问题一
2. 问题二
3. 问题三

## 修改范围

允许修改的文件或模块：

- 文件 A
- 文件 B
- 组件 C

## 禁止修改

不允许修改的内容：

- 不允许修改首页
- 不允许删除素材
- 不允许更换整体风格
- 不允许修改路由结构

## 具体执行步骤

1. 第一步
2. 第二步
3. 第三步

## 验收标准

1. 标准一
2. 标准二
3. 标准三

## 风险点

1. 风险一
2. 风险二

## 交付物

- 修改后的代码
- 修改摘要
- CHANGELOG.md
- 必要截图或说明
```

---

## 9. CHANGELOG.md 标准格式

执行者每轮完成修改后必须更新：

```md
# CHANGELOG.md

## 日期

YYYY-MM-DD

## 执行 Agent

Claude Code / Codex / Hermes

## 本轮修改目标

简述本轮任务。

## 修改内容

1. 修改了什么
2. 修复了什么
3. 新增了什么

## 修改文件

- 文件 A
- 文件 B

## 未完成内容

- 未完成事项一
- 未完成事项二

## 风险提示

- 风险一
- 风险二

## 下一步建议

- 建议一
- 建议二
```

---

## 10. REVIEW.md 标准格式

Codex 审查后必须输出：

```md
# REVIEW.md

## 审查对象

当前 git diff / 指定文件 / 指定功能

## 是否完成 TASK.md

结论：完成 / 部分完成 / 未完成

## 必须修复

1. 问题一
2. 问题二

## 建议优化

1. 优化一
2. 优化二

## 多余修改

1. 多余修改一
2. 多余修改二

## 潜在风险

1. 风险一
2. 风险二

## 是否可以交付

结论：可以交付 / 修复后交付 / 不建议交付

## 给执行 Agent 的修复指令

明确列出下一步应该修什么，不要发散。
```

---

## 11. HANDOFF.md 标准格式

如果任务没有完全完成，或者需要另一个 Agent 接手，必须写入：

```md
# HANDOFF.md

## 当前状态

说明项目当前做到哪一步。

## 已完成

1. 已完成事项一
2. 已完成事项二

## 未完成

1. 未完成事项一
2. 未完成事项二

## 修改过的文件

- 文件 A
- 文件 B

## 当前问题

1. 问题一
2. 问题二

## 下一个 Agent 应该做什么

1. 下一步一
2. 下一步二

## 注意事项

1. 不要改什么
2. 不要删什么
3. 不要覆盖什么
```

---

## 12. Hermes 给 Claude Code 的标准提示词

Hermes 唤起 Claude Code 时，使用以下提示：

```text
请先阅读项目根目录中的 work.md 和 TASK.md。

你是本轮唯一执行 Agent。
你可以修改项目文件，但不允许扩大 TASK.md 的范围。
如果你无法读取 work.md 或 TASK.md，请停止执行并说明缺少哪个文件。

阅读完成后，请先用不超过 5 条 bullet 总结：
1. 你本轮的角色
2. 你允许做什么
3. 你禁止做什么
4. 你准备修改的范围
5. 你认为的主要风险

然后输出执行计划，包括：
1. 你理解的任务
2. 你准备查看的文件
3. 你准备修改的文件
4. 风险点
5. 执行步骤

执行完成后，请更新 CHANGELOG.md。
如果没有完成，请更新 HANDOFF.md。
```

---

## 13. Hermes 给 Codex 审查的标准提示词

Hermes 唤起 Codex 审查时，使用以下提示：

```text
请先阅读项目根目录中的 work.md、TASK.md 和当前 git diff。

你现在是审查 Agent，不是执行 Agent。
请只审查，不要修改文件。
如果你无法读取 work.md、TASK.md 或 git diff，请停止并说明缺少什么。

阅读完成后，请先用不超过 5 条 bullet 总结：
1. 你本轮的角色
2. 你审查的范围
3. 你禁止做什么
4. 你重点检查什么
5. 你输出什么结果

请检查：
1. 是否完成 TASK.md
2. 是否存在多余修改
3. 是否有潜在 bug
4. 是否破坏已有功能
5. 是否存在 UI / 交互 / 结构风险
6. 是否可以交付

请按 REVIEW.md 格式输出审查结果。
```

---

## 14. Hermes 给 Codex 执行的标准提示词

只有在高风险或 Claude Code 多次失败时，Hermes 才允许 Codex 执行。

提示：

```text
请先阅读项目根目录中的 work.md、TASK.md 和 REVIEW.md。

你现在是本轮唯一执行 Agent。
只允许修复 REVIEW.md 中的“必须修复”部分。
不要处理“建议优化”。
不要扩大修改范围。
不要重构无关文件。
不要删除素材。
不要修改用户未授权的内容。

执行完成后，请更新 CHANGELOG.md。
如果没有完成，请更新 HANDOFF.md。
```

---

## 15. Hermes 让 Claude Code 修复 Codex 反馈的标准提示词

Codex 审查后，如果问题不严重，应交回 Claude Code 修复。

提示：

```text
请先阅读项目根目录中的 work.md、TASK.md 和 REVIEW.md。

你是本轮唯一执行 Agent。
请只修复 REVIEW.md 中的“必须修复”问题。
不要处理“建议优化”。
不要扩大修改范围。
不要改动无关文件。
不要删除素材。

修复完成后，请更新 CHANGELOG.md。
如果无法修复，请更新 HANDOFF.md 并说明原因。
```

---

## 16. 分支与回滚规则

每个任务建议使用独立分支：

```text
work/task-name-date
```

示例：

```text
work/fix-course-panel-20260525
```

执行前建议记录当前状态：

```bash
git status
git diff
```

执行后建议检查：

```bash
git status
git diff
```

不允许在以下情况下继续修改：

```text
1. 当前工作区有不明来源修改
2. 上一轮 Agent 没有写 HANDOFF.md
3. TASK.md 不清楚
4. 用户没有确认大改方向
5. AGENT_LOCK.md 显示其他 Agent 正在执行
```

---

## 17. 禁止事项

以下行为禁止：

```text
1. 禁止 Hermes、Claude Code、Codex 同时修改同一个项目
2. 禁止两个 Agent 同时修改同一个文件
3. 禁止没有 TASK.md 就直接修改
4. 禁止绕过 work.md
5. 禁止直接在 main 分支上大改
6. 禁止删除用户素材
7. 禁止自动清理文件夹
8. 禁止把未确认的旧方案覆盖新方案
9. 禁止把审查任务变成重构任务
10. 禁止 Agent 自行决定“顺便优化”
11. 禁止修改与任务无关的页面
12. 禁止替换用户已经确认的视觉风格
13. 禁止生成无法回滚的大规模修改
14. 禁止未经说明安装依赖
15. 禁止未经确认修改部署配置
16. 禁止在无法读取 work.md 时继续执行
17. 禁止在无法读取 TASK.md 时继续执行
```

---

## 18. 任务类型判断

Hermes 收到任务后，先判断任务类型。

### A 类：普通执行任务

交给 Claude Code。

例如：

```text
1. 改页面
2. 修样式
3. 修按钮
4. 做动效
5. 生成 md
6. 调整排版
7. 普通 bug 修复
```

### B 类：审查任务

交给 Codex。

例如：

```text
1. 检查 diff
2. 检查 bug
3. 检查是否完成任务
4. 检查有没有多余修改
5. 检查是否可交付
```

### C 类：高风险任务

先让 Codex 出方案，再让 Claude Code 执行。

例如：

```text
1. 大规模重构
2. 多文件复杂逻辑
3. 游戏系统
4. 路由系统
5. 数据结构
6. 部署问题
```

### D 类：复盘任务

交给 Hermes。

例如：

```text
1. 项目总结
2. 工作日志
3. 简历项目描述
4. 作品集包装
5. 客户反馈整理
6. 下一轮任务规划
```

---

## 19. 最终交付标准

一个任务完成前，必须满足：

```text
1. TASK.md 中的验收标准全部完成
2. CHANGELOG.md 已更新
3. 没有未说明的文件改动
4. 没有删除用户素材
5. Codex 审查结果为“可以交付”或“修复后可以交付”
6. 如果仍有问题，必须写入 HANDOFF.md
7. Hermes 必须整理最终总结
```

最终总结格式：

```text
本轮完成：
1.
2.
3.

修改文件：
1.
2.
3.

当前风险：
1.
2.

下一步建议：
1.
2.
```

---

## 20. 给 Hermes 的启动指令

当用户把本文件放进 Hermes 的工作目录后，可以对 Hermes 发送：

```text
请阅读你工作目录中的 work.md。

以后你作为我的三 Agent 项目总调度，负责接收需求、生成 TASK.md、判断任务类型，并决定本轮应该交给 Claude Code 还是 Codex。

你必须遵守以下规则：
1. 每一轮只能有一个执行 Agent。
2. 另一个 Agent 只能做审查。
3. Claude Code 和 Codex 不允许同时修改同一个项目。
4. 你每次唤起 Claude Code 或 Codex 时，都必须要求它们先阅读 work.md 和 TASK.md。
5. 如果你无法直接唤起 Claude Code 或 Codex，就输出可复制的提示词，不要假装已经调用成功。
6. 修改前必须创建或检查 AGENT_LOCK.md。
7. 修改后必须汇总 CHANGELOG.md、REVIEW.md 或 HANDOFF.md。
```

---

## 21. 给 Claude Code 的首次阅读指令

如果需要手动把规则交给 Claude Code，可以发送：

```text
请阅读项目根目录中的 work.md，并严格遵守其中关于 Claude Code 的角色定义。

你默认是主力执行 Agent。
你不能绕过 TASK.md。
你不能扩大修改范围。
你不能删除素材。
你不能和 Codex 同时修改项目。

阅读后请先总结你的角色、边界和禁止事项。
没有 TASK.md 时，不允许开始修改。
```

---

## 22. 给 Codex 的首次阅读指令

如果需要手动把规则交给 Codex，可以发送：

```text
请阅读项目根目录中的 work.md，并严格遵守其中关于 Codex 的角色定义。

你默认是独立审查 Agent。
你默认只审查，不修改。
你需要基于 work.md、TASK.md 和 git diff 输出 REVIEW.md。
除非我明确指定你作为执行 Agent，否则不要改项目文件。

阅读后请先总结你的角色、审查范围和禁止事项。
没有 TASK.md 或 git diff 时，不允许开始审查。
```

---

## 23. 最终结论

```text
work.md 应该优先交给 Hermes。
Hermes 负责调度。
Claude Code 负责执行。
Codex 负责审查。
三者可以协作，但不能并行乱改。
```
