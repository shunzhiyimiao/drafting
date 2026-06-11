# Drafting — Product Design Document

> 一个面向 Indie Hacker 的 AI 协作软件生产平台
>
> 产品名:**Drafting**
>
> 本文档是产品的设计宪法,记录了所有已经确定的概念、架构、硬约束和设计决定。
> 任何后续设计或实现都必须遵守本文档,除非经过显式的版本演进决策。

## 关于名字

**Drafting** 一词有三层含义,都契合产品定位:

1. **起草**:写作和规划的初稿动作。Drafting 不是"写最终代码",而是"起草一个软件"——和 AI 协作,持续打磨
2. **制图**:工程师在 drafting table 上画图。这是 Patchboard、Blueprint、Atlas 整体世界观的核心动词
3. **草稿态**:软件的最佳状态是"持续可修改的草稿",而不是"凝固的最终产物"。这是 vibe coding 的哲学

整体世界观:
- **Drafting**:产品名,工作台
- **Headquarters**:司令部,主界面
- **Blueprint**:蓝图,意图层
- **Patchboard**:接线板,架构层
- **Atlas**:地图集,理解层

---

## Part 0:产品定位

### 一句话定义

一个为新时代 vibe coding 设计的软件生产平台,通过"规格驱动 + 架构可视化 + AI 协作"三个核心能力,让开发者(尤其是 Indie Hacker)能够更快、更可控地构建软件。

### 与现有 AI IDE 的差异化

市面上 Cursor、Windsurf、Continue、Claude Code 等 AI 编程工具的共同点:
- 都基于"AI 在文本编辑器里补全/生成代码"这个基础范式
- 都没有项目级的"规格"概念
- 都没有架构级的可视化
- 都没有"主界面式"的项目管理视图

本产品的差异化:
- **规格驱动开发(Blueprint)**:用 Markdown 写下意图,AI 据此生成和检查代码
- **架构可视化(Patchboard)**:图形化的 Socket/Adapter 架构编辑器,生成静态装配代码
- **代码理解(Atlas)**:只读的代码结构和引用关系浏览器
- **司令部主界面(Headquarters)**:统一的项目管理和行动指引

四个核心子系统通过严格的边界和事件总线协同,构成一个完整的 AI 协作开发循环。

### 目标用户

**v1 目标用户:个人开发者 / 独立开发者 / Indie Hacker**

典型画像:
- 一个人或两三人小团队,身兼产品、设计、开发、运营
- 时间极度稀缺,追求"开箱即用"
- 大量使用 AI 协作(Cursor/Claude Code/v0 是日常工具)
- 严重依赖现成服务(Vercel/Supabase/Stripe)
- 熟悉 Git 但不一定精通,日常用 status/commit/push/pull
- 几乎不使用图形化调试器,console.log + AI 调试更顺手
- 追求可移植性,讨厌被工具锁定

非目标用户(v1 不优化):
- 大型企业团队
- 需要复杂团队协作功能的群体
- 需要图形化调试器的群体(Java/C# 等)
- 教学场景(虽然有潜力)

### v1 时间预期

**3-6 个月发布,通过 Claude 辅助开发达到 6-12 个月的效果**

- 单人 + Claude 辅助
- 总计约 16-23 周
- 每天 6-8 小时高质量协作时间

---

## Part 1:核心隐喻系统

四个核心子系统的命名来自"建造和管理一个大型工程"的统一隐喻:

| 子系统 | 隐喻 | 动词 | 角色 |
|---|---|---|---|
| **Headquarters** | 司令部 | 统筹 | 主界面,项目管理 |
| **Blueprint** | 蓝图 | 想清楚 | 意图层,规格 |
| **Patchboard** | 接线板 | 装起来 | 架构层,装配 |
| **Atlas** | 地图集 | 看明白 | 现状层,理解 |

四个名字共同构成产品的世界观:**在司令部规划,画蓝图,在车间装配,用地图集勘察现场**。这种命名一致性让用户一接触就能形成完整的心智模型。

### 三个核心动词

整个平台的核心心智模型可以用三个动词概括:

```
想清楚 ────────► 装起来 ────────► 看明白
(Blueprint)     (Patchboard)    (Atlas)
意图层          架构层          现状层
```

每个层次的工具只做自己擅长的事,严格不越界:
- Blueprint 不画架构图(架构归 Patchboard)
- Blueprint 不分析代码(分析归 Atlas)
- Patchboard 不写规格(规格归 Blueprint)
- Patchboard 不展示已有代码结构(展示归 Atlas)
- Atlas 不编辑任何东西(编辑归编辑器和 Patchboard)
- Atlas 不定义意图(意图归 Blueprint)

---

## Part 2:Patchboard(架构层)

### 定位

一个设计时的、图形化的、同语言范围内的架构编辑工具,用于描述模块之间的契约、实现、依赖关系,并生成类型安全的接口、实现骨架和静态装配代码。

### 核心概念

**Patchboard**:整个图形化架构编辑器子系统的名字。

**Socket**:契约/接口定义。声明某种能力的方法签名,不含实现。
- 工程级一等公民,在 Registry 中唯一存在
- 可被其他 Socket 继承(`extends`)
- 有生命周期状态(draft/stable/deprecated/removed)
- 在 TypeScript 中对应 `export interface`
- 可被多个 Canvas 引用,但只在 Registry 中定义一次

**Adapter**:契约的具体实现类。承担"统一接入标准"的角色——把任何外部东西(第三方库、CLI、AI、测试器、数据库)翻译成符合 Socket 的形式。
- 必须 `implements` 至少一个 Socket
- **禁止任何 `extends`**(硬约束,Adapter 是叶子节点)
- 可同时 implements 多个 Socket
- 依赖只能通过构造函数注入声明
- 在 TypeScript 中对应 `export class ... implements ...`
- 属于单一 Canvas,不跨 Canvas 共享

**Canvas**:一张架构图。单层、无嵌套。包含若干 Socket 节点(引用 Registry)、Adapter 节点、Wire 连线、入口点。在 TypeScript 中生成 Wiring 函数。

**Wire**:Adapter 之间的依赖注入连线。表达"A 提供能力给 B"的关系,语义上对应"B 的构造参数接收一个 A 的实例"。

**Entry Point**:Canvas 的装配起点。代码生成器以入口点为根,反向遍历 Wire 拓扑排序,生成构造顺序。

### Patchboard v1 硬约束

**概念层(1-3)**

1. **单层画布**:Canvas 不可嵌套
2. **Socket 可继承,Adapter 不可继承**:Adapter 之间只能通过 Wire 组合
3. **Adapter 强约束**:必须 implements 至少一个 Socket;禁止任何 extends;依赖只能通过构造函数注入

**语言与方向(4-5)**

4. v1 仅 TypeScript,基于 ts-morph 做代码生成
5. 仅正向(画图 → 代码),数据模型为 v2 逆向预留 marker

**运行时模型(6-7)**

6. 编译期静态装配,生成普通构造函数调用,无运行时容器
7. 禁止循环 Wire,画布层面拒绝

**Socket 生命周期与作用域(8-11)**

8. 工程级 Socket Registry,Socket 是一等公民,Canvas 只引用不持有;Wire 严格限定在单 Canvas 内
9. Socket 只能在 Registry 修改,Canvas 是只读消费者
10. Socket 有 lifecycle 状态机(draft / stable / deprecated / removed),变更触发影响评估和迁移流程
11. Registry 分文件存储,`index.json` 由工具维护并提交到 Git

**工程结构与所有权(12-17)**

12. 使用 monorepo + pnpm workspaces 布局
13. 四个包的所有权严格分离:
    - `packages/sockets`:**工具拥有**,每次重生成整体覆盖
    - `packages/adapters`:**用户拥有**(`index.ts` 例外),骨架只生成一次
    - `packages/wiring`:**工具拥有**,每次重生成整体覆盖
    - `packages/app`:**完全归用户**,工具不动
14. 生成代码中禁止相对路径 import,所有跨包引用通过包名(`@myapp/sockets` 等)
15. Socket 包通过 `index.ts` 作为公共 API 统一出口
16. Adapter 包的 `index.ts` 是工具维护的清单文件
17. Socket fullName 的命名空间层级自动映射为 sockets 包内的目录结构

**补充约束**

- Canvas 上同一个 Adapter 类只能出现一次,多实例由 Adapter 内部 `new` 实现
- Adapter 可以 implements 多个 Socket(统一接入标准的定位)
- Adapter 的 constructorParams 允许混合 Socket 依赖和原始类型参数

### 工程物理结构

```
my-project/
├── package.json                      ← 根包,声明 pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── .patchboard/                      ← Patchboard 元数据
│   ├── config.json
│   ├── registry/
│   │   ├── index.json                ← 工具维护,提交到 Git
│   │   └── sockets/
│   │       └── 01H*.json             ← 一 Socket 一文件
│   └── canvases/
│       └── *.canvas.json
│
└── packages/
    ├── sockets/                      ← @myapp/sockets,工具整体覆盖
    │   └── src/
    │       ├── index.ts              ← 统一出口
    │       └── {namespace}/
    │           └── *.ts
    ├── adapters/                     ← @myapp/adapters,用户拥有
    │   └── src/
    │       ├── index.ts              ← 工具维护的清单
    │       └── *.ts                  ← 用户实现
    ├── wiring/                       ← @myapp/wiring,工具整体覆盖
    │   └── src/
    │       └── *.wiring.ts
    └── app/                          ← @myapp/app,完全归用户
        └── src/
            └── main.ts
```

### Type Bridge 的分级机制

当 Wire 两端的类型不完全匹配时,Type Bridge 自动生成转换代码:

- **Level 1**:无损隐式转换(int → long、向上转型),自动生成,不打扰用户
- **Level 2**:有损或风险转换(需要用户确认才生成,UI 上 wire 显示黄色)
- **Level 3**:结构映射(需要用户提供字段映射,v1 不做)
- **Level 4**:不兼容(画布层面拒绝连线,wire 显示红色)

v1 实现 Level 1-2,Level 3-4 留 v1.5。

---

## Part 3:Blueprint(意图层)

### 定位

一个"MD 作为一等公民"的规格管理系统,让人类的意图以结构化 Markdown 的形式存在,AI 读它来生成代码、检查代码、追踪进度。

Blueprint 不是文档工具、不是需求管理、不是 wiki、不是测试规格、不做自然语言编程。它的使命是让"意图"成为代码的源头,并和 AI 形成闭环。

### 核心概念

**Blueprint**:整个 MD 驱动开发系统的名字。

**特性级 Blueprint(feature)**:描述一个特性的完整规格,可能涉及多个代码文件。**必须**关联 Acceptance Criteria。

**文件级 Blueprint(file)**:描述单个代码文件的具体规格。**可选**,适合复杂文件使用。

**Acceptance Criteria**:可验证的标准,以 GFM task list 形式存储,勾选状态即真相。这是 Headquarters 进度计算和 AI 检查的核心数据。

**模板**:带 Mustache 占位符的 Blueprint 骨架,降低非职业人员的上手门槛。v1 内置至少 8 个 feature 模板和 6 个 file 模板。

### Blueprint v1 硬约束

**结构与命名(1-5)**

1. **双层结构**:特性级 Blueprint(必须)+ 文件级 Blueprint(可选)
2. **文件命名**:`*.blueprint.md`,文件级路径镜像代码文件路径
3. **MD 主体由约定章节构成**:
   - 特性级:Goal / Context / Acceptance Criteria / Constraints / Out of Scope / Notes
   - 文件级:Purpose / Responsibilities / Acceptance Criteria / Constraints / Notes
4. 未识别的章节作为自由笔记,AI 读取但不机械处理;UI 视为"原始 MD 区块"
5. **Acceptance Criteria 使用 GFM task list**,勾选状态即真相

**检查机制(6-12)**

6. 检查触发为混合模式:保存触发轻量(无 AI),手动触发深度(调 AI)
7. AI 检查结果包含 verdict / explanation / suggestion / references 四个字段
8. **AI 检查结果不写入 MD 文件**,存储在 `.blueprint/check-results/`,编辑器渲染时合并展示
9. AI 检查结果整体替换,不追加
10. 检查失效以"标记过时"代替"自动清除"
11. v1 加缓存,基于 blueprintHash + codeHash + modelId 的 cacheKey,缓存目录不进 Git
12. 未关联文件级 Blueprint 的代码文件,checklist 检查降级到特性级 Blueprint

**存储与协作(13-16)**

13. 所有 Blueprint MD 文件提交 Git
14. **`.blueprint/` 目录不提交 Git**(check-cache 和 check-results 都是本地工具产物)
15. `index.json` 工具维护并提交 Git,损坏时可全量重建
16. 文件级 Blueprint 的 `targetFile` 自动同步(IDE rename 事件),失败时降级到"孤儿警报"

**模板系统(17)**

17. v1 必须内置模板系统,模板格式为 `*.template.md` 带 Mustache 占位符,内置至少 8 个 feature 模板和 6 个 file 模板,支持工程级和全局两种来源

**关联关系(18-19)**

18. Blueprint 通过 ID 双向引用 Patchboard Socket/Adapter,工具自动同步两边
19. Atlas 单向引用 Blueprint,Blueprint 不引用 Atlas

**编辑器视图(20-27)**

20. Blueprint 编辑器必须提供原始 MD 视图和结构化视图,用户可随时切换
21. 两个视图共享同一份 in-memory AST,绝不引入第二份数据源
22. 文件持久化只有一份 `.blueprint.md`,结构化视图不产生额外文件
23. **Round-trip safety**:任意 MD parse-then-serialize 应保持内容等价
24. 工具不识别的 front matter 字段保存在 AST 的 extras,serialize 时原样写回
25. 工具不识别的 MD 章节降级为 'unknown' kind,原样保留 markdown
26. 结构化视图的章节区块允许嵌套 Markdown 编辑,不是纯表单控件
27. 首次打开 Blueprint 默认结构化视图,偏好按 Blueprint 记住

### Blueprint 文件组织

```
my-project/
├── blueprints/                       ← Blueprint 的领地
│   ├── index.json                    ← 工具维护,Git
│   ├── features/                     ← 特性级 Blueprint(必须)
│   │   └── *.blueprint.md
│   ├── files/                        ← 文件级 Blueprint(可选)
│   │   └── packages/                 ← 镜像 packages 路径
│   │       └── adapters/src/
│   │           └── *.blueprint.md
│   └── templates/                    ← 工程级模板
│       ├── feature/
│       └── file/
│
└── .blueprint/                       ← 本地工具缓存,不进 Git
    ├── check-cache/                  ← AI 检查结果缓存
    ├── check-results/                ← 当前的检查结果
    └── activity.jsonl                ← 活动流
```

### YAML Front Matter 关键字段

特性级:
- `blueprintId` (ULID)
- `type: feature`
- `displayName`
- `status: draft | in-progress | completed | deprecated`
- `priority: low | medium | high | critical`
- `owner: human | ai | collaborative`
- `relatedSockets: [socketId, ...]`
- `relatedAdapters: [adapterId, ...]`
- `relatedFiles: [path, ...]`
- `relatedBlueprints: [{id, relation}, ...]`
- `tags: [...]`
- `lastCheckedAt`, `lastCheckedBy`, `checkVersion`

文件级:
- 同上,加上 `targetFile`(必填)
- `parentBlueprints: [...]`(归属的特性级 Blueprint)

### 内置模板清单

**特性级模板(8 个)**:
- crud-service:CRUD 服务
- api-endpoint:REST API 端点
- background-job:后台任务
- data-import:数据导入
- notification:通知/消息
- auth-flow:认证流程
- report:报表生成
- simple-feature:通用空白模板

**文件级模板(6 个)**:
- service:业务服务类
- repository:数据访问类
- adapter:Patchboard Adapter(自动关联到 Patchboard)
- controller:HTTP 控制器
- validator:校验器
- utility:工具函数模块

---

## Part 4:Atlas(理解层)

### 定位

一个只读的、图形化的代码结构和引用关系浏览器。读取 LSP 和 AST 数据,把"文件内部结构"和"跨文件引用关系"以树形图、思维导图、网络图的形式呈现。

Atlas 是地图集——多张地图的集合,每张地图展示代码的不同方面。

### 核心约束

- **Atlas 是只读的**——任何视图都不允许修改代码,所有编辑动作必须回到文本编辑器
- **Atlas 不做方法级可视化编程**——方法体内部逻辑不在 Atlas 的展示范围
- **Atlas 展示的是"已有代码的现状"**,不是"设计的意图"
- **Atlas 的所有视图都有节点数量上限**(默认 200),超过强制折叠或过滤
- **Atlas 数据来源于 LSP + ts-morph 索引**,有后台缓存,不阻塞 UI
- **Atlas 不生成代码,不修改代码,不运行代码**
- **Atlas 提供双向跳转**:从图到代码、从代码到图
- **Atlas 能独立工作在非 Patchboard 项目上**

### 三种核心视图

**File Map(文件结构图)** —— v1 必做
- 单个源文件的内部结构,层级树形
- 数据来源:LSP `documentSymbol` + ts-morph 类型信息
- 形式:左右展开的树,根在左,子节点向右

**Reference Map(引用关系图)** —— v1.5
- 选中一个符号,以它为中心向两侧辐射
- 左侧"谁用我",右侧"我用谁"
- 形式:思维导图,可继续展开
- 数据来源:LSP `references` + `callHierarchy`

**Module Map(模块依赖图)** —— v1.5
- 项目内的 package/目录/文件之间的 import 依赖关系
- 形式:分层视图(默认)、力导向图(可选)
- 数据来源:遍历 import 语句,建立依赖图

### v1 范围

v1 只做 **File Map** 一种视图,Reference Map 和 Module Map 留 v1.5。

### 双向跳转

- Atlas 节点 → 代码:点击节点跳转到源代码行
- 代码 → Atlas:编辑器里 Ctrl+点击或快捷键唤起 Atlas
- Atlas 识别 Adapter:看到 `// @adapter-id:` 注释,提供"在 Patchboard 中查看"入口
- Atlas 识别 Blueprint:看到对应的文件级 Blueprint,提供"查看 Blueprint"入口

---

## Part 5:Headquarters(主界面)

### 定位

IDE 的默认主界面,统筹整个工程的管理。Headquarters 是**司令部**,不是"仪表盘"——它的目标是引导用户的下一步行动,而不是展示状态。

### 设计哲学

**Headquarters 上每个元素都要回答一个问题**:"看到这个,用户会做什么?"
- 无法引导行动的展示型信息一律砍掉
- 每个元素都必须是行动入口
- 任何"看起来酷但不引导行动"的设计都要被打回

### 信息架构

**项目身份区**(顶部)
- 项目名 + 整体进度环
- 关键数字串(features / criteria / warnings / in-progress)
- 健康状态徽章(🟢 健康 / 🟡 注意 / 🟠 风险 / 🔴 告警)
- 上次 AI 检查时间、Git 状态

**智能建议**(身份区下方)
- 始终显示一条建议
- 优先级链:Level 1 critical → Level 2 error → Level 3 stalled → Level 4 empty draft → Level 5 in-progress → Level 6 健康 → Level 7 全新项目
- 不可关闭、不可忽略
- 每条建议有明确的行动按钮

**主区**(行动中心)
- 左 60%:特性进度列表
  - 每个特性卡片显示进度、状态、优先级、警报、关联 Socket、时间提示
  - 支持排序(优先级/进度/更新时间/创建时间/字母)
  - 支持过滤(全部/进行中/有警报/被遗忘/空的/完成/按 tag)
  - 支持视图(列表/卡片)
- 右 40%:警报与待办
  - 警报区:三档展示模式(全展开/分级折叠/徽章模式)
  - 待办区:从所有未勾选的 criteria 聚合,按 Blueprint 分组

**底部**(辅助信息)
- 最近活动流(最近 5-10 条)
- AI 配置摘要(各任务路由到哪个模型)
- 快捷入口(6 个常用操作)

### Headquarters v1 硬约束

**信息架构(1-5)**

1. Headquarters 是 IDE 默认主界面(可被用户关闭并记住偏好)
2. Headquarters 上每个元素必须能引导用户的下一步行动,纯展示型信息禁止
3. Headquarters 的信息分四层:项目身份 / 智能建议 / 行动中心 / 辅助信息
4. 主区采用左特性 / 右警报待办的双栏布局,左栏占主导
5. **Headquarters 不显示任何图形化的关系图**,所有信息都是列表、徽章、进度条、文字。图形化归 Patchboard 和 Atlas

**数据源(6-8)**

6. Headquarters 数据全部从 `blueprints/index.json` + `.patchboard/registry/index.json` + `.blueprint/check-results/*.json` + `.blueprint/activity.jsonl` 聚合
7. Headquarters 不维护任何独立的数据模型或缓存
8. Headquarters 通过订阅 Sync Bus 事件实时增量更新,不全量重算

**性能(9-12)**

9. Headquarters 首次渲染骨架屏 < 200ms
10. Headquarters 主要数据(特性卡片、警报)就绪 < 600ms
11. Headquarters 完整数据(包括待办列表)就绪 < 1 秒
12. 所有数据计算在后台线程或 Web Worker 中执行,不阻塞 UI

**警报机制(13-15)**

13. **警报永远不可被忽略或删除**
14. 警报有三档展示模式:全展开(默认)、分级折叠(按严重级别)、徽章模式(只显示总数),用户可手动切换,模式选择记在本地偏好
15. 警报总数超过 10 条时自动从全展开降级到分级折叠,但用户可手动展开

**智能建议(16-20)**

16. Headquarters 顶部始终显示一条智能建议
17. 智能建议永远只显示一条,不显示列表
18. 智能建议不可被用户关闭或忽略
19. 智能建议的优先级链固定为 Level 1-7,顺序不可调
20. 智能建议的行动按钮必须明确指向一个具体位置或操作

**交互(21-23)**

21. 特性卡片的所有元素都可点击,跳转到对应的子系统
22. 支持键盘导航和快捷键,前缀化命令风格(`g d` / `g b` / `g p` 等)
23. Headquarters 不支持用户自定义布局(v1-v2),开箱即用

**降级与边界(24-27)**

24. 任何数据源加载失败时降级显示,不全屏崩溃
25. 空状态有专门设计,引导用户进入下一步
26. 小屏幕(<1024px)降级为单列布局,极小屏幕(<768px)显示"窗口太小"提示
27. v1 单工程,不支持工具内多工程切换;多工程通过操作系统多窗口实现

---

## Part 6:三系统协同与平台架构

### 数据所有权边界

```
my-project/
├── blueprints/              ← Blueprint 的领地(Git)
├── .blueprint/              ← Blueprint 本地缓存(.gitignore)
├── .patchboard/             ← Patchboard 的领地(Git)
├── .atlas/                  ← Atlas 本地索引(.gitignore)
└── packages/                ← 共享代码空间
    ├── sockets/             ← Patchboard 写,其他只读
    ├── adapters/            ← Patchboard 生成骨架 + 用户填
    ├── wiring/              ← Patchboard 写,其他只读
    └── app/                 ← 用户拥有
```

### 引用关系

| 关系 | 类型 | 持久化 | 说明 |
|---|---|---|---|
| Blueprint ⇌ Patchboard | 双向 | Git | 工具自动同步,两边都存 ID |
| Patchboard → packages | 单向写入 | Git | packages 不反向影响 Patchboard |
| Atlas → packages | 单向只读 | 否 | Atlas 索引在本地缓存 |
| Atlas → Blueprint/Patchboard | 单向 | 否 | 通过 marker 识别,不持久化 |

**核心洞察**:只有 Blueprint 和 Patchboard 是双向关联的(协同设计),其他都是单向。

### 三系统协同硬约束

**目录与所有权(1-2)**

1. 三个子系统各有独立的 `.前缀目录`(`.patchboard/`、`blueprints/`、`.atlas/`),互不交叉访问
2. `packages/` 是共享代码空间,只有 Patchboard 能写,Blueprint 和 Atlas 只读

**引用关系(3-5)**

3. Blueprint ⇌ Patchboard 是平台内**唯一**的双向引用,工具自动同步
4. Patchboard → packages 是单向写入,packages 不反向影响 Patchboard
5. Atlas → 一切都是单向只读,Atlas 不发布事件、不写持久化文件(除自己的缓存)

**事件总线(6-9)**

6. **跨子系统协同必须通过 Sync Bus 事件,严格禁止子系统之间直接 import 对方的代码模块或调用对方的函数**
7. 所有事件携带 `origin` 字段,用于幂等和循环防护
8. 事件不携带文件内容,只携带 ID 和关键元数据
9. 所有跨系统更新必须做幂等检查,避免无限循环

**Headquarters 集成(10-12)**

10. Headquarters 是 IDE 默认主界面
11. Headquarters 数据全部从 `Patchboard registry/index.json` + `blueprints/index.json` 聚合,不维护独立数据模型
12. Headquarters 通过订阅 Sync Bus 事件实时刷新

**启动(13-15)**

13. 工程打开时 Atlas 异步初始化,不阻塞 Headquarters 显示
14. 没有 `.patchboard/` 的工程也能用编辑器 + Atlas(降级模式)
15. 启动时间目标:Headquarters 显示 < 1 秒(中等规模工程)

**事件循环防护(16-17)**

16. 所有持久化写入前先检查"是否已经是目标值",是则跳过
17. 事件订阅者忽略 `origin` 等于自己的事件

**Sync Bus(18-19)**

18. Sync Bus 是平台级一等组件,有独立代码模块、集中的事件类型定义、统一的发布订阅 API、调试和测试支持
19. Sync Bus v1 底层用 in-process EventEmitter 实现,但抽象层完整,未来可替换为跨进程或持久化实现而不改任何业务代码

### 平台级原则

**原则 1:Git 是代码和规格的版本管理系统,不是工具状态的同步系统**

进 Git:源代码、Blueprint MD、Patchboard Registry/Canvas、配置文件
不进 Git:本地缓存、AI 检查结果、活动流、个人偏好、临时索引、本地工具状态

**原则 2:精心设计 > 用户配置(v1-v2 阶段)**

在产品早期,布局、面板、视觉样式由产品设计决定,不暴露给用户配置。配置自由度是 v3+ 的成熟度特性,过早配置化会让"开箱即用"变成"调参折磨"。

**原则 3:单工程,多窗口由操作系统提供**

工具内不实现多工程切换。需要并行工作多个工程时,用户开多个 IDE 窗口(操作系统级)。

### 平台级服务

除了三个核心子系统,平台还有六个跨系统的基础服务:

1. **AI Provider Manager**:多 AI 配置、按任务路由、流式响应、计费追踪
2. **Editor Engine**(Monaco):文本编辑、LSP 客户端、AI 补全集成
3. **Headquarters**:主界面,聚合三系统数据
4. **File System Watcher**:监听变化、触发联动、debounce
5. **Sync Bus**:进程内事件总线,跨子系统通信的标准接口
6. **Settings**:用户偏好、AI Provider 配置、主题/布局

---

## Part 7:技术栈

### 锁定决定

**Tauri 2 + Rust + React + TypeScript**

这个组合是 v1 的硬性技术栈,不再变动。理由:
- Tauri 2:包大小和内存对 Indie Hacker 友好(比 Electron 小 5-10 倍)
- Rust 后端:文件 IO、Git、LSP、终端等系统操作的性能和类型安全优势
- React + TypeScript:生态最大,react-flow 和 shadcn/ui 是关键依赖,Claude 协作度最高

### 桌面外壳

- **Tauri 2**(最新稳定版):跨平台桌面应用框架(Mac/Win/Linux)

### Rust 后端

- **tokio**:异步运行时
- **serde + serde_json**:序列化
- **notify**:文件系统监听
- **portable-pty**:终端 pty
- **git2**:Git 操作(libgit2 绑定)
- **ts-rs**:从 Rust 类型生成 TypeScript 类型,保持前后端类型一致
- 自己写的 **Sync Bus**(基于 tokio broadcast channel)
- 自己写的 **LSP 客户端**(辅以 lsp-types crate)

### Node.js 子进程(代码生成器)

由于 ts-morph 是 TypeScript 库,Rust 调不了,采用子进程方案:
- **Node.js**(通过 Tauri sidecar 机制打包,用户零依赖)
- **ts-morph**:TypeScript AST 操作和代码生成
- **typescript**:类型检查
- 通过 stdio JSON-RPC 和 Rust 主进程通信
- 子进程常驻,首次启动 200-500ms,常驻后 50-100MB 内存

这是工业界标准做法(VS Code 自己的 TS 语言服务也是这种架构),不是 hack。

### React 前端

- **React 18** + TypeScript
- **Vite**:构建工具
- **Zustand**:状态管理(轻量、简单、TS 友好)
- **Tailwind CSS**:样式
- **shadcn/ui**:组件库(基于 Radix UI,复制源码可改)
- **Radix UI**:底层组件原语
- **react-flow / @xyflow/react**:Patchboard Canvas 核心
- **Monaco Editor**:代码编辑器
- **xterm.js**:终端
- **react-hook-form**:Blueprint 结构化视图的表单
- **unified + remark + remark-frontmatter**:Blueprint MD parser/serializer
- **react-markdown**:Blueprint 视图渲染

### 不用的东西(明确排除)

- **不用 React Router**:IDE 面板切换用 Zustand 全局 state 管理就够,不需要 URL 路由(v1.5+ 如需深度链接再加)
- **不用 Redux / MobX**:Zustand 足够,Redux 过于重型
- **不用 Vue / Svelte / Solid 等其他前端框架**:已锁定 React
- **不用 Electron**:已经评估过,包大小和内存对目标用户不友好
- **不用 Material UI / Ant Design 等"完整设计系统"**:它们的视觉风格强烈,会让产品看起来像"另一个企业工具",和 Indie Hacker 审美不符。shadcn/ui 是更好的选择

### 工程

- **pnpm workspaces**:monorepo 管理
- **Cargo workspaces**:Rust 子项目管理
- **GitHub Actions**:CI(构建 Mac/Win/Linux 安装包)
- **Tauri bundler**:打包 dmg/msi/AppImage

### LSP

- v1 内置 TypeScript Language Server(`typescript-language-server` 或 tsserver)
- 通过 Rust 后端的 LSP 客户端转发到前端 Monaco
- v2 才考虑加其他语言

### 仓库结构(参考)

```
patchboard/                          ← 仓库根
├── package.json                     ← pnpm 根
├── pnpm-workspace.yaml
├── Cargo.toml                       ← Rust workspace 根
├── tsconfig.base.json
├── CLAUDE.md                        ← 产品设计文档(本文档)
│
├── apps/
│   └── desktop/                     ← Tauri 应用
│       ├── src-tauri/               ← Rust 后端
│       │   ├── Cargo.toml
│       │   └── src/
│       │       ├── main.rs
│       │       ├── sync_bus/
│       │       ├── patchboard/
│       │       ├── blueprint/
│       │       ├── atlas/
│       │       ├── git/
│       │       ├── terminal/
│       │       ├── lsp/
│       │       └── codegen_proxy/   ← Node.js 子进程管理
│       ├── src/                     ← React 前端
│       │   ├── App.tsx
│       │   ├── views/               ← 各子系统的 view
│       │   │   ├── headquarters/
│       │   │   ├── patchboard/
│       │   │   ├── blueprint/
│       │   │   ├── atlas/
│       │   │   ├── editor/
│       │   │   └── terminal/
│       │   ├── components/          ← 共享组件(shadcn 组件放这里)
│       │   ├── stores/              ← Zustand stores
│       │   ├── lib/                 ← 工具函数
│       │   └── types/               ← 共享类型(从 Rust 生成)
│       └── tauri.conf.json
│
├── packages/
│   ├── codegen-server/              ← Node.js 子进程,用 ts-morph
│   │   ├── package.json
│   │   └── src/
│   └── shared-types/                ← TypeScript 类型(从 Rust 生成)
│
└── docs/
    └── PRODUCT-DESIGN.md            ← 产品设计文档
```

注意:这里的 `packages/` 是 **Patchboard 平台本身的源代码**,和"用户工程的 packages/"(`@myapp/sockets` 等)是不同概念,前者是产品源码,后者是产品生成的用户代码。两者在不同仓库,不会混淆。

### 开发者前置准备

如果开发者(你)主要写过 Vue 而不是 React,需要在阶段 0 投入约 1 周时间熟悉:
- React 18 + Hooks 基础
- TypeScript + React 的最佳实践
- Zustand 的使用模式
- shadcn/ui 的复制和定制

这一周不是浪费——是阶段 0 的一部分,可以和工程脚手架并行。Claude 协作能加速这个学习过程。

---

## Part 8:v1 范围

### v1 必做

| 模块 | 完整度 | 说明 |
|---|---|---|
| Patchboard 核心 | 80% | Registry + Canvas + 代码生成 + ts-morph,Type Bridge 只做 Level 1-2 |
| Blueprint 核心 | 75% | 双视图 + AI 检查 + 缓存 + 模板系统,结构化视图最简版 |
| Headquarters | 90% | 完整 27 条硬约束,智能建议 Level 1-5 |
| Atlas | 50% | 只做 File Map,Reference/Module Map 留 v1.5 |
| 编辑器 | 70% | Monaco + LSP + AI 补全 + Git 装饰 |
| AI Provider Manager | 80% | 多 provider + 任务路由 + 流式 |
| CLI / 终端 | 60% | xterm.js + pty + 多 tab + 命令历史 |
| Git 基础 | 50% | status/diff/commit/push/pull/branch list |
| Sync Bus | 100% | 完整事件 schema + 发布订阅 + 防护 |
| 跨平台 | 70% | Mac/Win/Linux 都跑,Mac 深度测试 |

### v1 不做(留 v1.5/v2)

- 调试器(确认不做)
- 扩展系统(确认不做)
- 自动化测试(整体砍)
- 多语言支持(只做 TypeScript)
- Patchboard event 支持
- Blueprint 结构化视图的高级控件
- Type Bridge Level 3-4
- Atlas Reference Map 和 Module Map
- Git 高级功能(merge、cherry-pick、rebase)
- 团队协作功能
- 用户布局自定义
- 多工程切换

### 6 阶段开发节奏

| 阶段 | 时间 | 目标 |
|---|---|---|
| 0 | 2-3 周 | 奠基:工程脚手架、Sync Bus、IDE 主界面骨架 |
| 1 | 4-6 周 | Patchboard 核心 |
| 2 | 3-4 周 | Blueprint 核心 |
| 3 | 3-4 周 | Headquarters + 编辑器集成 |
| 4 | 2-3 周 | Atlas + CLI/终端 + Git 基础 |
| 5 | 2-3 周 | 打磨和发布准备 |

**总计 16-23 周(4-5.5 个月)**

---

## Part 9:Claude 协作开发指南

### 适用场景

本项目使用 Claude(Opus 4.6 + Claude Code)作为主要开发协作者,目标是 1 人 + Claude 的开发模式达到 6-12 个月版本的产出。

### Claude 的最佳协作场景(高加速比)

- **样板代码 / 脚手架 / 配置文件**(8-15 倍加速)
- **业务逻辑 / 普通 CRUD**(3-5 倍)
- **算法实现 / 数据结构**(2-3 倍)
- **schema 实现和验证**(3-5 倍)
- **文档和模板内容**(5-10 倍)

### Claude 的弱项(需要人类把关)

- **审美判断**:UI 的最后 10%,文案的措辞
- **产品决策**:任何"应该选 A 还是 B"的判断
- **复杂调试**:容易自信地走错方向
- **跨文件状态管理**:容易忽略上下文

### 使用 Claude Code 的关键实践

1. **本文档作为 CLAUDE.md**:放在仓库根目录,Claude Code 启动时自动读取,作为产品宪法
2. **先写 Blueprint,再让 Claude 写代码**:每个新功能先用 Blueprint 描述意图和约束,然后让 Claude 基于 Blueprint 实现
3. **明确架构边界**:每次让 Claude 写代码前,告诉它属于哪个子系统、可访问哪些 API
4. **每天体力上限 6-8 小时**:超过这个时间审阅质量下降,代码会出问题

### 技术债的安全区

**绝对不允许有技术债的区域**:
- Patchboard 代码生成器
- Blueprint schema 和 parser/serializer
- Sync Bus 事件 schema 和 API
- 硬约束校验器

**可以有技术债的区域**(v1.5 重构):
- UI 组件样式和布局细节
- 错误处理的边界情况
- 性能优化(先做对再做快)
- 测试覆盖率
- 文档(产品自举)

---

## Part 10:术语表

### 子系统名

- **Patchboard**:架构层,Socket/Adapter 的图形化编辑器
- **Blueprint**:意图层,MD 驱动开发系统
- **Atlas**:理解层,只读代码探查
- **Headquarters**:主界面,司令部

### Patchboard 术语

- **Socket**:契约/接口定义
- **Adapter**:契约的具体实现类
- **Canvas**:一张架构图
- **Wire**:Adapter 之间的依赖注入连线
- **Entry Point**:Canvas 的装配起点
- **Type Bridge**:类型自动适配规则
- **Registry**:工程级 Socket 目录

### Blueprint 术语

- **特性级 Blueprint(feature)**:描述一个特性的规格
- **文件级 Blueprint(file)**:描述单个代码文件的规格
- **Acceptance Criteria**:可验证的标准(GFM task list)
- **模板(template)**:带 Mustache 占位符的 Blueprint 骨架
- **Round-trip safety**:MD parse-then-serialize 内容保持等价
- **Round-trip 安全的 AST**:支持双视图同步的核心数据结构

### Atlas 术语

- **File Map**:文件结构图(树形)
- **Reference Map**:引用关系图(思维导图)
- **Module Map**:模块依赖图(网络图)

### Headquarters 术语

- **智能建议**:始终显示一条的下一步行动建议
- **特性卡片**:特性进度列表的单元
- **健康状态**:🟢 健康 / 🟡 注意 / 🟠 风险 / 🔴 告警
- **警报展示模式**:全展开 / 分级折叠 / 徽章模式

### 平台术语

- **Sync Bus**:跨子系统通信的事件总线
- **Origin**:事件携带的发布者标记,用于循环防护
- **AI Provider Manager**:多 AI 模型管理和路由

---

## Part 11:CLI / 终端模块

### 定位

Drafting 的终端不是"嵌入了一个 iTerm",而是 Drafting 工作流的有机组成部分。它要满足三个核心场景:

1. **跑长期运行的开发服务器**(dev server、watcher 等)
2. **跑一次性命令**(包括 Claude Code、Codex、git 等)
3. **Drafting 自己生成的命令**(代码生成后的 install、build 等)

### 终端的两种角色

终端模块同时支持两种角色,共享同一个 PTY Manager:

- **User Terminal**:用户主动交互的终端 tab,UI 完整
- **Programmatic Terminal**:其他模块通过 API 调用,可选择"显示给用户"或"后台跑"

任何模块需要跑命令都通过 TerminalManager,**严禁直接调用 std::process::Command**。

### 技术选型

**前端**:
- xterm.js + xterm-addon-fit + xterm-addon-web-links + xterm-addon-search + xterm-addon-canvas

**后端**:
- portable-pty(跨平台 PTY 抽象)
- tokio(异步运行时,管理 PTY 流)

**通信**:
- Tauri event(Rust → 前端,推送 PTY 输出)
- Tauri invoke(前端 → Rust,推送用户输入)
- Sync Bus(终端发布事件给其他模块)

### v1 必做功能

**核心能力**
- 多 tab(Cmd+T 新建、Cmd+W 关闭、Cmd+1-9 切换)
- 默认 shell 自动检测 + 用户可配置(macOS/Linux 用 `$SHELL`,Windows 探测 PowerShell 7 → PowerShell 5 → cmd)
- 复制粘贴、滚动、字号调整、清屏、终端尺寸自适应

**命令历史**
- 持久化到 `.drafting/local/terminal-history.jsonl`(本地,不进 Git)
- 上下箭头浏览、Cmd+R 模糊搜索
- 跨 tab 共享,per-project,上限 10000 条
- 不记录包含 PASSWORD/TOKEN/API_KEY/SECRET 等敏感关键词的命令

**搜索**
- Cmd+F 在当前 tab 内搜索

**Programmatic Terminal API**
```rust
TerminalManager::run_command(cmd, opts) -> CommandResult
TerminalManager::spawn_task(cmd, opts) -> SessionId
TerminalManager::cancel(session_id)
TerminalManager::promote_to_ui(session_id)
```

DisplayMode 三种:Background / NewTab / ExistingTab

**Claude Code / Codex 快捷启动**
- Cmd+Shift+C 启动 Claude Code 新 tab(可配置)
- Cmd+Shift+X 启动 Codex 新 tab(可配置)
- 自动 cd 到工程根目录

**CLAUDE.md 自动生成**
- 用户第一次启动 Claude Code 时,如果 CLAUDE.md 不存在,询问是否生成
- 生成内容包括:项目概览、技术栈、工程结构、当前 Patchboard Sockets、当前 Blueprint 列表、Drafting 强制的硬约束、常用命令
- 用 marker 标记自动生成区段(`<!-- @drafting-auto-generated:start/end -->`),用户在 marker 外的手动内容不会被覆盖
- 命令面板提供 "Regenerate CLAUDE.md",只重新生成 marker 区段

**Drafting 内部命令**
- `drafting status`、`drafting check <blueprint>`、`drafting gen <canvas>` 等
- 可在终端里跑

### v1 不做

- SSH / 远程命令
- tmux/screen 风格会话恢复
- 命令补全(交给系统 shell)
- shell 高级集成(prompt 标记、命令时间统计)
- 图片显示 / sixel 协议
- 多终端 split pane
- 终端主题深度定制(只提供 dark/light)
- 终端字体自定义(用系统默认等宽字体)
- 终端录制和回放
- 跨工程命令历史共享
- 终端内嵌 AI 解释(留 v1.5+,Warp 风格的特色)

### UI 集成

**编辑器视图的下侧面板**:
- 多用途面板,可切换 Checklist / Terminal / Problems / Tasks
- 默认显示 Checklist(Blueprint 的核心特色)
- 终端轻量,通常 1 个 tab

**终端 view**(左侧边栏 🔧 入口):
- 全屏多 tab,跑长期任务
- 底部 Tasks 面板,显示所有 background task

**两者共享同一个 PTY Manager**,session 可以在两个 view 之间提升/降级。

### 进程生命周期

- 关闭 tab:SIGTERM,5 秒不退出则 SIGKILL
- 关闭 Drafting:graceful shutdown,所有 session 最多等 10 秒,超时 SIGKILL
- 子进程绑定到 Drafting 进程组(setpgid/prctl),防止孤儿进程
- 进程意外退出:不自动重启,保留输出和退出码,显示在 tab 标题(如 `dev server (exited 1)`)

### 性能要求

- 输出延迟 < 16ms(60fps)
- 大量输出场景必须有反压机制
- 高频 SessionOutput 事件不通过 Sync Bus 广播,只发给挂载 UI 的对应 view
- xterm-addon-canvas 渲染加速默认开启

### 限额

- **终端 view tab 上限:软上限 20**(超过警告,30 强警告,50 强制阻止)
- **Background task 上限:软上限 20**(同上)
- **Programmatic Terminal 输出捕获:默认 1MB**(可通过 opts 调整),超过截断或报错(可配置)

### 字体

终端字体使用**与编辑器一致的 JetBrains Mono**(打包字体,Apache 2.0 许可证)。Settings 里的字体配置在编辑器和终端之间联动——改一处两边都生效,保持视觉一致性。Settings 也允许独立设置(高级用户)。

### Sync Bus 事件

```rust
pub enum TerminalEvent {
    SessionCreated { session_id, display_mode, cwd, command }
    SessionFinished { session_id, exit_code, duration_ms }
    SessionCancelled { session_id }
    SessionPromotedToUi { session_id, tab_id }
    SessionOutput { session_id, output, stream }  // 高频,不广播
    UserCommandStarted { session_id, command }
    UserCommandFinished { session_id, command, exit_code, duration_ms }
}
```

### 终端模块和其他模块的协同

| 场景 | 通过 TerminalManager | 理由 |
|---|---|---|
| 用户敲命令 | ✅ | UI 终端的本职 |
| Claude Code / Codex | ✅ | 用户交互式 AI CLI |
| pnpm install / pnpm build | ✅ | 一次性命令,需要看进度 |
| git status / git commit | ❌ | 用 libgit2,直接进程内 |
| LSP 通信 | ❌ | 高频,直接 stdio |
| AI Provider HTTP | ❌ | 不是命令 |
| ts-morph 代码生成 | ❌ | 常驻子进程 |
| 复杂 git 操作(rebase 等) | ✅ fallback | git2 不支持时用 |
| dev server 等长期任务 | ✅ | UI 持久 tab |

### 终端模块 v1 硬约束清单

**架构(1-5)**

1. 终端模块基于 portable-pty(后端)+ xterm.js(前端),不发明轮子
2. 终端有两种角色:User Terminal 和 Programmatic Terminal,共享同一个 PTY Manager
3. **任何模块需要跑命令都必须通过 TerminalManager,严禁直接调用 std::process::Command**
4. PTY Manager 是终端模块的一等组件,管理所有 session 的生命周期
5. 终端模块的 Rust API 通过 Tauri invoke/event 暴露给前端,不直接暴露 PTY 句柄

**功能范围(6-10)**

6. v1 必做:多 tab、命令历史、shell 集成、复制粘贴、滚动、字号调整、清屏、终端搜索
7. v1 必做:Programmatic Terminal API(run_command / spawn_task / cancel / promote_to_ui)
8. v1 必做:Claude Code 和 Codex 的快捷启动 + CLAUDE.md 自动生成
9. v1 必做:默认 shell 用户可配置
10. v1 不做:SSH、tmux、命令补全、shell 高级集成、split pane、自定义字体、终端内嵌 AI

**UI 集成(11-13)**

11. 终端默认在编辑器视图的下侧面板(可与 Checklist / Problems / Tasks 切换)
12. 终端有"专门的 view"(左侧边栏 🔧 入口),全屏多 tab
13. 同一个 PTY session 可以在下侧面板和终端 view 之间提升/降级,共享底层 session

**进程管理(14-17)**

14. 关闭 tab 时,SIGTERM PTY session,5 秒内不退出则 SIGKILL
15. Drafting 应用退出时,graceful shutdown,最多等 10 秒,超时 SIGKILL
16. 子进程必须绑定到 Drafting 进程组,防止孤儿进程
17. 进程意外退出后不自动重启,保留输出历史和退出码

**性能(18-20)**

18. 输出延迟 < 16ms
19. 大量输出场景必须有反压机制
20. 高频 SessionOutput 事件不通过 Sync Bus 广播

**历史与隐私(21-22)**

21. 命令历史存在 `.drafting/local/terminal-history.jsonl`,不进 Git,上限 10000 条
22. 命令历史不记录敏感关键词命令

### v1 工程量预估

**2-3 周**(约 13-21 天),分项:
- portable-pty + xterm.js 集成:3-5 天
- 多 tab + 命令历史 + 搜索:2-3 天
- Programmatic Terminal API:2-3 天
- Claude Code 集成 + CLAUDE.md 自动生成:1-2 天
- 进程管理和清理:1-2 天
- UI 集成(下侧面板 + 终端 view):2-3 天
- 测试和打磨:2-3 天

---

## Part 12:Git 基础模块

### 定位

覆盖 95% 日常 Git 操作的 GUI 面板,基于 git2(libgit2 Rust 绑定),v1 不涉及 GitHub API,复杂操作让用户去终端,带 AI 生成 commit message。

**Drafting 的 Git 模块不是 GitKraken**,而是"日常操作的快捷面板 + 编辑器内 Git 装饰 + 必要时 fallback 到终端"。

### 技术选型

**主选:git2 crate**(进程内调用,毫秒级响应,不依赖系统是否装了 git)

**Fallback:git CLI**(复杂操作 rebase/cherry-pick/bisect 等让用户在终端跑)

| 操作 | 实现 |
|---|---|
| status / diff / commit / push / pull / fetch | git2 |
| branch list / checkout / create / delete | git2 |
| log / stash(简单) | git2 |
| merge(简单)| git2 |
| rebase / cherry-pick / bisect / interactive rebase | 终端 git CLI |
| 复杂 stash / submodule | 终端 git CLI |

### 鉴权

- 通过系统的 git credential helper(macOS Keychain、Windows Credential Manager、Linux libsecret)
- SSH 通过用户系统的 ssh-agent
- **Drafting 严禁在自己存储里保存任何 token、密码、SSH key**
- **系统要求**:macOS / Windows / Linux + git 2.x(因为 credential helper 依赖系统 git)

### Hooks 限制

git2 不跑 git hooks。Drafting 检测到工程有 husky 或 .git/hooks/pre-commit 时:
- commit UI 上显示温和提示
- 提供"用终端 commit"按钮作为兜底
- 不强制阻止用户在 Drafting 内 commit

### v1 必做功能

**核心 Git 操作**

- **Status**:工作区修改文件列表,按目录分组,M/A/D/R/U 状态徽章
- **Diff**:行级别 diff,side-by-side(默认)和 inline 两种视图,支持折叠未修改部分
- **Commit**:hunk 级别选择文件内容,multi-line message,AI 辅助生成 message
- **Push / Pull / Fetch**:与 origin 同步,显示进度,错误提示
- **Branch**:list / create / checkout / delete(本地)
- **Log**:commit 历史,按文件过滤,点击查看完整 diff
- **Stash**:简单的 stash / pop / apply / drop / list
- **Discard / Restore**:文件级和 hunk 级,二次确认
- **Conflict 检测**:不做三路合并 GUI,只在编辑器内提供"接受当前/传入/双方/手动"按钮

**AI 辅助 commit message**

- 用户点 `[✨ AI 生成]` 按钮触发
- 收集 staged 文件的 diff
- 如有关联 Blueprint,Goal 和 Acceptance Criteria 作为 context
- 默认 conventional commits 格式(`feat:` / `fix:` 等),Settings 可关
- 默认跟随系统语言(macOS/Windows/Linux 系统语言决定),Settings 可独立配置
- 流式响应,逐字填入输入框
- 用户可以接受、拒绝、或在生成 message 上继续修改
- 基于 diff hash 缓存

### v1 不做(留 v1.5/v2)

- GitHub API 集成(PR、issue、actions)—— v1.5
- Rebase / cherry-pick / bisect 的 GUI(让用户去终端)
- Interactive rebase
- Submodule 管理
- Word-level diff
- Branch graph 视图
- Blame 完整面板(只做编辑器内的简化 inline blame)
- Tag 管理
- Reflog / Worktree
- Git config 编辑
- 三路合并视图
- 二进制文件预览(只显示文件大小变化)

### UI 集成

**位置 1:Headquarters 状态摘要**

```
Git: 🌿 main · ↑3 ↓0 · 5 modified  [→ 打开 Git 面板]
```

**位置 2:编辑器内的 Git 装饰**

- Gutter 改动条(蓝色 = 修改、绿色 = 新增、红色三角 = 删除)
- Hover 显示简化 inline blame(完整 blame 面板留 v1.5)
- 冲突标记的特殊渲染(冲突区块按钮:接受当前/传入/双方/手动)
- 编辑器底部状态栏:文件 Git 状态 + 快捷操作(Stage / Discard / View Diff)

**位置 3:专门的 Git view**(左侧边栏 🌿 入口)

主要区域:
- 顶部:当前分支 + origin 同步状态 + 刷新按钮
- Changes 区:工作区修改文件列表,可勾选要 commit 的(支持 hunk 级别)
- Commit 区:message 输入 + AI 生成按钮 + Commit / Commit & Push 按钮
- 操作区:Push / Pull / Fetch / Branches / History / Stash 入口

`Branches` / `History` / `Stash` 弹出次级面板,不挤主区。

### Conflict 处理流程

1. **检测**:`git pull` / `git merge` 后 git2 返回冲突状态,Drafting 弹窗 + 标记冲突文件
2. **编辑器内解决**:冲突 marker 渲染成区块,提供"接受当前/传入/双方/手动"按钮
3. **标记解决**:所有 marker 移除后,用户点 `[Mark as Resolved]`,git2 标记 resolved
4. **完成 merge**:所有冲突解决后,用户点 `[Continue Merge]`,git2 完成 merge commit
5. **兜底**:复杂冲突可点 `[Abort Merge]` 回退,或在终端跑 `git mergetool`

### 与其他模块的协同

**关键事件:`BranchCheckedOut`**

切换分支可能改变 `.patchboard/` `blueprints/` 等所有数据,所以这个事件触发:

- Patchboard:reload 所有 Registry 和 Canvas
- Blueprint:reload index 和打开的 Blueprint 文件,询问用户是否重新加载
- Atlas:增量重建索引(后台)
- 编辑器:刷新所有打开的 tab

**其他事件**:Headquarters 订阅所有 Git 事件刷新顶部摘要;活动流显示 Git 操作。

### Sync Bus 事件

```rust
pub enum GitEvent {
    StatusChanged { modified, added, deleted, untracked, conflicted }
    FileStatusChanged { path, old_status, new_status }
    CommitCreated { commit_hash, message, files_count }
    BranchCreated { name }
    BranchDeleted { name }
    BranchCheckedOut { from, to }
    FetchCompleted { remote, commits_received }
    PullCompleted { from, commits_received, has_conflicts }
    PushCompleted { to, commits_pushed }
    OperationFailed { operation, reason }
}
```

### 性能要求

- status 计算 < 100ms(中等仓库)
- diff 单文件 < 50ms
- commit < 200ms
- log 100 条 < 200ms
- branch list < 50ms
- gutter 装饰更新 < 100ms

**优化要点**:status 增量计算(不全量扫描)、diff 用 web worker、log 分页加载

### 大文件和二进制

- **大文件**:超过 1MB 的文件不显示 diff,提供"在终端查看"链接
- **二进制文件**:显示"Binary file" + 文件大小变化(before X bytes / after Y bytes),不做图片预览(留 v1.5)

### 自动化处理

- **没有 git 的工程**:Drafting 检测到没有 .git/ 时,询问用户是否 init,提供一键操作
- **.gitignore 自动维护**:Drafting 启动时检查 .gitignore,自动追加 `.drafting/` `.atlas/` `.blueprint/`,不修改用户已有内容

### Git 模块 v1 硬约束清单

**架构(1-5)**

1. Git 模块基于 git2 crate(libgit2 Rust 绑定)实现核心操作
2. 复杂操作(rebase/cherry-pick/interactive rebase/bisect)v1 不做 GUI,让用户在终端里跑
3. **Drafting 严禁在自己的存储里保存任何 git/github token、密码、SSH key**
4. 鉴权完全委托给系统的 git credential helper 和 ssh-agent
5. **Drafting 的系统要求包括 git 2.x**

**功能范围(6-11)**

6. v1 必做:status / diff / commit / push / pull / fetch / branch / log / stash / discard / conflict 检测
7. v1 必做:AI 辅助 commit message 生成(默认 conventional commits,默认跟随系统语言)
8. v1 必做:hunk 级别的 stage
9. v1 必做:编辑器内的 gutter 装饰(改动条)和简化 inline blame
10. v1 必做:编辑器内的冲突解决 UI(接受当前/传入/双方/手动编辑)
11. v1 不做:GitHub API、rebase GUI、branch graph、word-level diff、blame 完整面板、tag 管理、二进制预览

**Hooks(12)**

12. git2 不跑 git hooks;Drafting 检测到 husky 或 pre-commit hook 时显示提示;提供"用终端 commit"按钮兜底

**UI 集成(13-16)**

13. Git 在三个位置出现:Headquarters 状态摘要、编辑器内装饰、专门的 Git view
14. Git view 的核心区域:Changes 列表 + Commit 输入 + Push/Pull/Branches/History/Stash 入口
15. AI 生成 commit message 是"生成 → 用户审阅 → 手动 commit",Drafting 永远不自动提交
16. 冲突解决在编辑器内进行,不做三路合并视图

**性能(17-19)**

17. status 计算 < 100ms(中等仓库)
18. status 通过监听文件变化做增量更新,不全量扫描
19. gutter 装饰的 diff 计算在 web worker 或后台线程,不阻塞 UI

**协同(20-21)**

20. **`BranchCheckedOut` 事件触发 Patchboard、Blueprint、Atlas 全部 reload**
21. Git 错误不影响项目健康度(Git 不进 Headquarters 的健康判定算法)

**自动化(22-24)**

22. "Commit & Push" 按钮提供,位置不显眼防误点
23. Git view 不定期主动刷新,只在用户操作时 + 文件监听触发
24. 大文件(>1MB)不显示 diff,二进制文件只显示大小变化
25. 没有 git 的工程询问用户是否 init,自动维护 .gitignore

### v1 工程量预估

**2-3 周**(约 18-26 天),分项:

- git2 集成 + 基础操作:3-4 天
- 分支管理:1-2 天
- Stash:1 天
- Conflict 检测和编辑器解决 UI:2-3 天
- AI 辅助 commit message:1-2 天
- Git view 完整 UI:3-4 天
- 编辑器内 gutter 装饰和 inline blame:2-3 天
- Headquarters 集成:1 天
- 性能优化:2-3 天
- 测试和打磨:2-3 天

---

## Part 13:AI Provider Manager 模块

### 定位

AI Provider Manager 是平台级一等组件,Drafting 内的所有 AI 调用都通过它。它解决六个核心问题:

1. **统一封装**:屏蔽 Anthropic / OpenAI / Ollama 等差异
2. **任务路由**:不同任务路由到不同模型(用户配置)
3. **上下文构建**:把 Blueprint、Patchboard、相关代码组装成高质量 prompt
4. **流式响应**:所有 AI 调用都是流式的,可随时取消
5. **成本和配额**:token 计数、缓存、月度预算
6. **隐私边界**:三层防护,完整审计

**这是 Drafting 区别于 Cursor 的核心差异化**——把 AI 协作的控制权完整交给用户。

### 核心架构

六个子组件:

```
AI Provider Manager
├── Provider Adapters    (统一封装各 provider)
├── Task Router          (任务到模型的映射)
├── Context Builder      (各任务的上下文策略)
├── Privacy Filter       (三层隐私防护)
├── Stream Manager       (流的生命周期)
└── Cost Tracker         (token、成本、预算)
```

### Provider 支持

**v1 必须支持**:
- **Anthropic Claude**(主力)
- **OpenAI**(GPT-5 系列、o3 系列)
- **OpenAI 兼容 endpoint**(DeepSeek / Together / Groq / 本地 vLLM 等)
- **Ollama**(本地模型,自动发现 `localhost:11434`)

**v1 不做**:Gemini、Bedrock、Azure OpenAI(留 v1.5+)

**鉴权**:
- 用户用自己的 API key,Drafting 不自带
- API key 存在系统 keychain(macOS Keychain / Windows Credential Manager / Linux libsecret)
- Drafting 自己的存储不保存任何 key

### Provider Adapter 接口

```rust
#[async_trait]
pub trait ProviderAdapter {
    fn id(&self) -> &str;
    async fn list_models(&self) -> Result<Vec<ModelInfo>>;
    async fn stream_chat(&self, request: ChatRequest, cancel: CancellationToken)
        -> Result<BoxStream<'static, Result<StreamEvent>>>;
    fn count_tokens(&self, text: &str, model: &str) -> Result<usize>;
    async fn health_check(&self) -> Result<()>;
}
```

所有 provider 都通过 `stream_chat` 单一接口对外,Anthropic 和 OpenAI 的差异在 adapter 内部翻译。

### Task Router

**任务(Task)**是 Drafting 内的 AI 使用场景,有明确的输入、输出、上下文要求。

**v1 内置任务清单**:

| Task ID | 名称 | 默认模型 |
|---|---|---|
| `editor.completion` | 代码补全 | Claude Haiku 4.5 |
| `editor.chat` | 编辑器对话 | Claude Sonnet 4.6 |
| `editor.explain` | 代码解释 | Claude Sonnet 4.6 |
| `editor.refactor` | 代码重构 | Claude Sonnet 4.6 |
| `blueprint.draft` | Blueprint 起草 | Claude Sonnet 4.6 |
| `blueprint.check` | Blueprint AI 检查 | Claude Opus 4.6 |
| `blueprint.suggest-criteria` | 建议 Acceptance Criteria | Claude Sonnet 4.6 |
| `patchboard.suggest-socket` | 建议 Socket 设计 | Claude Sonnet 4.6 |
| `patchboard.suggest-adapter` | 建议 Adapter 实现 | Claude Sonnet 4.6 |
| `git.commit-message` | Commit message 生成 | Claude Sonnet 4.6 |

每个任务有 Drafting 内置默认模型,用户可在 Settings 覆盖。fallback 链:用户配置 → 工程默认 → 内置默认 → 报错。

**调用方代码不直接选模型**:

```rust
// 不直接选模型,通过 TaskId 调用
ai_provider_manager.run_task(TaskId::BlueprintCheck, input).await?;
```

这让 Settings 改了路由后,所有相关功能立刻用新模型,调用方无需修改。

### Context Builder

**核心原则**:相关性 > 全量;结构 > 散文;示例 > 描述;明确边界;严格 token 预算。

**各任务的上下文策略**:

- **`editor.completion`**:光标前后 50 行 + 当前函数定义 + imports + 关联 Blueprint 的 Goal/Constraints。token 上限 2K
- **`blueprint.check`**:Blueprint 全文 + 关联代码全文 + import 一层依赖 + Patchboard 相关 Socket。token 上限 100K
- **`editor.chat`**:当前文件全文 + 选中代码 + 对话历史 + 当前 Blueprint(如果在 Blueprint 编辑器)。token 上限 20K
- **`patchboard.suggest-socket`**:选中代码 + 文件结构 + 已有 Socket 列表 + 命名规范

**Anthropic prompt caching 必须用**:把"几乎不变"的内容放前面(system prompt、Blueprint 内容),"经常变"的放后面(选中代码、最新对话),配合 cache control 标记,可省 90% 成本。

**token 预算超出时**:优先砍可选内容,不砍必需内容,告知用户。

**`included_files` 字段**:Context Builder 记录所有进入 prompt 的文件路径,用于隐私审计。

### Privacy Filter:三层防护

**第一层:文件路径黑名单**

默认排除:
- `.env`、`.env.*`
- `**/secrets/**`、`**/credentials/**`、`**/private/**`
- `*.key`、`*.pem`、`*.p12`
- `**/node_modules/**`、`**/.git/**`
- 用户自定义规则

被匹配的文件**永远不会**进入 AI prompt。

**第二层:内容扫描**

正则识别敏感模式:
- API key(`sk-`、`pk-`、`AKIA` 等)
- AWS access key
- GitHub token
- 数据库连接字符串
- 信用卡号

**默认行为:掩码模式**——发送但替换敏感字符串(替换为 `[REDACTED_API_KEY]` 等),UI 显示替换了什么。可在 Settings 改为强模式(拒绝)或询问模式。

**第三层:用户审批(可选,默认关)**

每次 AI 调用前弹窗显示 prompt 摘要,用户必须批准。给极度谨慎的用户。

**Provider 级隐私级别**:

- 🟢 本地(Ollama):完全不出网
- 🟡 云端零留存(Anthropic / OpenAI):普通代码 OK
- 🔴 不信任(用户自定义未知 endpoint):默认不允许发敏感文件

每个任务可配置最低隐私级别要求。

**审计日志**:`.drafting/local/ai-audit.jsonl`,记录每次 AI 调用的 task / provider / model / tokens / cost / included_files / timestamp。

- 保留 90 天 + 10MB 上限,先到先生效
- 清理时保留月度成本摘要
- 不进 Git
- Settings 里可查看完整日志

### Stream Manager

所有 AI 调用都是流式的:

- 每个流有唯一 stream ID
- 用户可独立 cancel
- 不同任务的流在不同 UI 位置显示(编辑器 ghost text / Chat 气泡 / Blueprint criteria 旁边等)
- 高频 `StreamProgress` 事件不通过 Sync Bus 广播,只发给订阅了该 stream 的特定 view

**重试规则**:
- 网络错误:自动重试 3 次,指数退避
- 429 限流:自动重试,按 Retry-After
- 5xx 服务器错误:自动重试 1 次
- 4xx 客户端错误(认证/输入无效):不重试
- 用户取消:不重试

**超时**:5 分钟无任何输出 → 视为超时,cancel + 报错

**并发限制**:全局 5 个,同任务类型 1 个(Settings 可调)

### Cost Tracker

**计费**:每次调用结束后从 `Usage` 事件拿到 token 数,查内置单价表,计算 USD,写入 audit log。

**单价表**:Drafting 内置,定期更新。用户可在 Settings 覆盖(给自定义 endpoint)。

**月度预算**:
- 默认不限,Settings 可设
- 80% 到达时:Headquarters 顶部温和提示
- 100% 到达时:阻止云端 AI 调用,本地模型(Ollama)仍可用
- 下月自动重置(本地时区月初)

**单次大调用预估**:
- 任务触发前预估 token 和成本,显示提示
- 阈值默认 $1,Settings 可配置
- 大于阈值时强制提示,可勾选"不再提醒"(per-task)

**任务级 token 上限**:
- 每个任务有默认 token 上限
- Settings 可调
- 超出时优先砍可选 context,告知用户

**缓存命中追踪**:
- Anthropic prompt caching 命中标记为 cached input,单价更低
- Drafting 自己的 Blueprint check 缓存命中**不算入成本**(没调 AI)
- UI 显示缓存命中率

### 配置 UI(Settings)

**Provider 配置区**:
- 添加 Provider(必须通过健康检查才能保存)
- API key / endpoint 配置
- 测试连接 / 移除

**任务路由区**:
- 每个任务的当前模型
- 切换模型下拉
- 温度、max_tokens 等参数
- 测试 / 恢复默认

**月度预算区**:
- 当前已用 / 预算
- 按任务/provider 的成本分布
- 预算阈值配置

**隐私设置区**:
- 默认隐私级别
- 内容扫描模式(强 / 掩码 / 询问 / 关)
- 自定义文件路径黑名单
- 审计日志查看

### 没配 API key 时

新装 Drafting 的用户首次使用 AI 功能:

- 弹窗"请配置 AI provider"
- 三个选项:Anthropic / OpenAI / Ollama
- 每个有 link 到注册页
- 检测到 Ollama 在跑时,标记为"已就绪,一键启用"
- **不做 demo key**

### 全局 AI 开关

Settings 里有"全局 AI 开关",关闭后:
- 所有任务路由失效
- 编辑器没有 AI 补全
- Blueprint 检查按钮变灰
- AI Chat 不可用
- Headquarters 智能建议降级到无 AI 模式

**Drafting 核心(Patchboard、Blueprint 编辑、Headquarters、Git、终端、编辑器)仍然完全可用**。这条让 Drafting 在用户没钱、API 故障、网络断时不会变砖。

### Sync Bus 事件

```rust
pub enum AiProviderEvent {
    // 配置
    ProviderAdded { provider_id }
    ProviderRemoved { provider_id }
    TaskRouteChanged { task_id, new_provider, new_model }
    
    // 流
    StreamStarted { stream_id, task, provider, model }
    StreamProgress { stream_id, tokens_received }  // 高频,不广播
    StreamCompleted { stream_id, input_tokens, output_tokens, cost_usd }
    StreamCancelled { stream_id }
    StreamFailed { stream_id, error }
    
    // 成本
    BudgetWarning { used_usd, limit_usd, percent }
    BudgetExceeded { used_usd, limit_usd }
    
    // 隐私
    PrivacyViolationBlocked { task, reason, file }
}
```

### AI 调用的"足迹"显示

任何 AI 流式响应的 UI 上,角落里有 ℹ️ 图标,hover 显示:

```
Provider: Anthropic
Model: claude-opus-4-6
Task: blueprint.check
Tokens: 8234 / 567
Cost: $0.045
Time: 12.3s
[查看详细 prompt]
```

点击"查看详细 prompt"看完整内容。这是建立用户信任的关键。

### v1 不做

- Drafting 自带 API key(留 v2+ SaaS 模式)
- 用户自定义 system prompt(留 v1.5 高级用户)
- 任务定义的扩展系统(留 v2 扩展系统统一处理)
- AI 调用的 A/B 对比
- 完整的 prompt engineering UI

### AI Provider Manager v1 硬约束清单

**架构(1-5)**

1. AI Provider Manager 是平台级一等组件,所有 AI 调用必须通过它
2. 任何模块**严禁绕过 AI Provider Manager 直接调用 AI provider 的 API**
3. Provider Adapters 通过统一的 trait 接口对外,屏蔽 provider 差异
4. 所有 AI 调用都是流式的,无非流式接口
5. 调用方调用任务(Task)而不是直接选模型,任务到模型的映射在 Settings 里配置

**Provider 支持(6-10)**

6. v1 必须支持:Anthropic、OpenAI、Ollama、OpenAI 兼容 endpoint
7. v1 不做:Gemini、Bedrock、Azure OpenAI
8. 用户必须用自己的 API key,Drafting v1 不自带 key
9. API key 存在系统 keychain,Drafting 自己不存
10. 添加 Provider 时强制做健康检查

**Task Router(11-14)**

11. v1 必须内置至少 10 个任务定义
12. 每个任务有内置智能默认模型,用户可覆盖
13. 用户配置不可用时自动 fallback 到默认,最后报错
14. 调用方代码只通过 TaskId 调用,不直接选模型

**Context Builder(15-18)**

15. 每个任务有专属上下文构建策略,不复用
16. 上下文构建器记录所有 included_files,用于审计
17. 必须使用 Anthropic prompt caching
18. token 预算超出时优先砍可选内容,告知用户

**Privacy Filter(19-23)**

19. 三层隐私防护:文件路径黑名单 + 内容扫描 + 用户审批
20. 默认排除 .env、secrets/、*.key、node_modules、.git 等
21. 内容扫描默认开启
22. **检测到敏感内容默认掩码模式**(替换敏感字符串),UI 显示替换了什么
23. 所有 AI 调用记录到 .drafting/local/ai-audit.jsonl,90 天 + 10MB 上限

**Stream Manager(24-27)**

24. 所有流可独立 cancel,通过 stream ID
25. 网络/限流/服务器错误自动重试,认证/输入错误不重试
26. 长连接 5 分钟无输出超时
27. 全局并发上限 5,同任务类型 1(Settings 可调)

**Cost Tracker(28-30)**

28. 每次调用记录 token 和成本,写审计日志
29. 内置模型单价表,用户可覆盖
30. 月度预算可设,80% 警告,100% 阻止云端调用(本地仍可用)
31. 大调用预估阈值默认 $1,可配置
32. 任务级 token 上限有默认值,可配置

**全局开关(33)**

33. 提供"全局 AI 开关",关闭后 Drafting 核心功能仍然完全可用

**配置 UI(34)**

34. 没配 API key 时弹窗引导,检测 Ollama 提供一键启用,不做 demo key

### v1 工程量预估

**3-4 周**(约 24-32 天):

- Provider Adapters(Anthropic / OpenAI / Ollama / OpenAI 兼容):4-5 天
- Task Router + 任务定义 + Settings UI:3-4 天
- Context Builder(各任务的策略):4-5 天
- Privacy Filter(三层防护 + 审计日志):3-4 天
- Stream Manager(流、cancel、重试):2-3 天
- Cost Tracker(token 计数、单价表、预算):2-3 天
- Settings 完整 UI:3-4 天
- 测试和打磨:3-4 天

---

## Part 14:编辑器集成(Editor Integration)模块

### 定位

Drafting 编辑器是 Drafting 的中枢神经——用户 80% 的时间在这里。但**编辑器本身不是 Drafting 的差异化所在**:Monaco 已经是世界级的代码编辑器,Drafting 不发明轮子。

**Drafting 的差异化在"集成"**——把编辑器和 Patchboard、Blueprint、Atlas、Git、AI、终端有机串起来,让用户在编辑器里享受到整个平台的能力。

设计原则:**底层 100% 用 Monaco,Drafting 的价值在集成层**。

**Drafting 编辑器是 VS Code 的增强版,不是替代品**——用户可以随时用外部 VS Code 打开同一个工程,一切都正常工作。不锁定用户。

### 技术选型

**编辑器核心:Monaco Editor**

理由:
- TypeScript 智能感知最强(微软自家)
- 生态最大,VS Code 同款体验
- AI 编辑器(Cursor/Continue/Windsurf)首选
- v1 只支持 TypeScript,Monaco 是最优解

**LSP 架构:Rust 后端中转**

```
[Front: Monaco]
      ↓ Tauri invoke/event
[Rust 后端: LSP Client]
      ↓ stdio (JSON-RPC)
[LSP Server: typescript-language-server]
```

理由:
- 生命周期可控(Drafting 退出时干净关闭)
- 多 LSP server 集中管理(为 v2 多语言准备)
- Sync Bus 集成自然
- 符合 Tauri 进程模型

**v1 内置 LSP server**:typescript-language-server,通过 Tauri sidecar 打包,用户零依赖。

**字体**:**打包 JetBrains Mono**(Apache 2.0 许可证,编辑器和终端共用),Settings 可换。

### v1 必做功能

**Monaco 自带 + Drafting 配置**

- 语法高亮(启用 Monaco 自带的所有语言)
- 自动缩进、自动闭合括号
- 多光标(Cmd+D / Cmd+Click)
- 查找替换(Cmd+F / Cmd+H)
- 全局查找(Cmd+Shift+F,后台异步,上限 50000 文件)
- 跳转定义(F12 / Cmd+Click)
- 跳转引用、查找用法
- 重命名符号(F2)
- 代码格式化(Shift+Alt+F)
- 折叠代码、注释切换
- 主题(Dark / Light,跟随系统)

**LSP 集成**

- 语法/类型错误高亮
- Hover 显示类型和文档
- 参数提示(signature help)
- 自动补全(LSP 类型补全)
- 跳转定义/引用、重命名、快速修复、代码格式化
- Outline 视图

**Drafting 特有的集成(差异化核心)**

**1. 文件身份识别(FileIdentity)**

打开文件时自动识别:
- `is_generated`:是否工具生成(检查 `// AUTO-GENERATED` 标记)
- `adapter_id`:是否 Patchboard Adapter(检查 `// @adapter-id:` 注释)
- `file_blueprint_id`:文件级 Blueprint(查 `blueprints/files/` 镜像路径)
- `feature_blueprint_ids`:特性级 Blueprint(查 `relatedFiles` 字段)
- `git_status`:Git 状态

身份信息显示在编辑器底部状态栏第二行,并被各模块用于联动。

**2. 工具生成文件的只读保护**

- `packages/sockets/`、`packages/wiring/` 下的文件**默认只读**
- 编辑器顶部显示警告横条:"这是 Patchboard 自动生成的代码,不要手动修改"
- 提供"在 Patchboard 中编辑"跳转按钮
- 提供"强制编辑"二次确认按钮(紧急情况用)

**3. Adapter 文件的细粒度保护**

Adapter 文件用户拥有,但 Patchboard 生成的部分受保护:
- **不能改**:类名、`implements` 子句、构造函数参数、`@adapter-id:` 注释
- **可以改**:类内部的方法体、类外的辅助函数、imports
- 检测基于 ts-morph 解析,违反时温和提示
- v1 做基础版本(类名/implements/构造函数检测),完整 hunk 级保护留 v1.5

**4. AI 补全(ghost text)**

- 触发:敲键 500ms 防抖,或光标停留 1 秒,或 Cmd+Space 主动触发
- 通过 AI Provider Manager 的 `editor.completion` 任务
- Context 自动注入文件关联 Blueprint 的 Goal/Constraints
- 灰色 ghost text 显示
- **Tab** 接受全部、**Cmd+→** 接受词、**Cmd+Shift+→** 接受行、**Esc** 拒绝
- 节流:同一位置 3 秒内不重复触发
- 缓存:相同 context hash 15 分钟内命中
- 月度 token 警戒线可设
- 可完全关闭自动 ghost text,只用手动 Cmd+Space

**5. Cmd+K 整段生成**

- 无选中:输入指令,AI 在光标处生成
- 有选中:输入指令,AI 修改选中代码,显示为 inline diff(灰色删除/绿色添加)
- 流式响应,Tab 接受、Esc 拒绝
- Context 包含文件全文 + Blueprint(如有)
- 任务路由:`editor.completion` 加强版 / `editor.refactor`

**6. AI 解释 / 重构**

右键菜单:
- "AI 解释":弹出气泡流式解释
- "AI 重构":弹出对话框输入指令,AI 修改

**7. AI 调用足迹**

每次 AI 补全或生成,角落 ✨ 图标,hover 显示模型/token/cost/time,点击查看完整 prompt。

**8. Blueprint context 自动注入**

任何 AI 调用都自动检查文件的 `feature_blueprint_ids`,把 Blueprint 的 Goal/Constraints/Acceptance Criteria 注入 prompt context。**用户不需要手动 @ Blueprint**。

**9. 状态栏(底部两行)**

第一行:`TS · UTF-8 · LF · 行 X 列 Y · ⚠ N errors · 🌿 main · M`

第二行(Drafting 特有):`📋 Blueprint名 · 🔌 Adapter名 · ⚙ AUTO-GENERATED`

每个标识都可点击跳转到对应子系统。

**多 Tab 管理**

- Cmd+T 新建(打开快速文件搜索)
- Cmd+W 关闭、Cmd+Shift+T 重新打开最近关闭
- Cmd+Tab 切换、Cmd+1-9 跳转
- 拖拽重排
- 未保存提示(小圆点)
- 关闭未保存时确认
- **Cmd+Alt+S 保存所有 tab**

**文件树(右侧面板)**

- 虚拟列表渲染,处理几千个文件不卡
- 树形展开/折叠
- 双击打开,右键菜单(新建/重命名/删除/复制路径)
- 拖拽移动文件,触发关联更新(git、Blueprint targetFile、imports)
- Git 状态着色
- **特殊标记**:🔌 Adapter / 📋 Blueprint / ⚙ generated / 🔒 privacy
- 默认隐藏 `.git/` `node_modules/` `.drafting/` `.atlas/` 等噪音
- `.patchboard/` 和 `blueprints/` **不隐藏**(核心数据)

**命令面板(Cmd+Shift+P)**

- 各模块自行注册命令(50-100 个)
- 模糊匹配 + 最近使用排序
- 显示快捷键
- v1 必备的命令组:文件、编辑器、Patchboard、Blueprint、Atlas、Git、终端、AI、Headquarters、Settings

**Zen 焦点模式**

- 隐藏左侧边栏 + 右侧面板 + 下侧面板
- 只显示编辑器
- 实现简单,Indie Hacker 喜欢
- 快捷键 Cmd+K Z(可配置)

**崩溃恢复**

- 每次操作后异步保存到 `.drafting/local/editor-state.json`
- 异常退出后,下次启动恢复打开的 tab 和未保存改动
- 提示:"上次会话异常退出,已恢复 N 个文件"

### v1 不做(留 v1.5/v2)

- Vim / Emacs keymap(留 v1.5)
- 自动格式化 on save(默认关闭,Settings 可开)
- Split editor(同窗口左右分屏)
- 多窗口编辑(同工程开两个窗口)
- 独立 Diff 视图(只在 Git 模块里有 diff)
- Notebook 模式(.ipynb)
- Live Share(多人协作)
- 远程编辑(SSH / Container)
- 完整的 Markdown 预览面板
- 图片预览编辑器
- GitLens 风格的高级 Git
- EditorConfig 支持(留 v1.5)
- 完整 hunk 级 Adapter 保护(留 v1.5)
- 工程级 type check(用户在终端跑)

### 协同(通过 Sync Bus)

**编辑器订阅的事件**:

- `EditorCommand::OpenFile { path, line, column }`:任何模块需要打开文件都发这个事件
- `EditorCommand::CloseFile`、`SaveAll`、`ReloadFile`、`SetReadonly`
- `git.BranchCheckedOut`:刷新所有打开的 tab
- `patchboard.code_generated`:刷新可能受影响的文件

**编辑器发布的事件**:

```rust
pub enum EditorEvent {
    FileOpened { path, identity }
    FileClosed { path }
    FileSaved { path }
    FileChanged { path }
    FileRenamed { old_path, new_path }
    TabActivated { path }
    DiagnosticsChanged { path, errors, warnings }
    LspReady { language }
    LspFailed { language, reason }
    CompletionShown { stream_id }
    CompletionAccepted { stream_id, accepted_chars }
    CompletionRejected { stream_id }
    FileIdentityChanged { path, identity }
}
```

**关键原则**:**所有"打开文件"请求都通过 Sync Bus 的 `OpenFile` 事件**,编辑器统一处理。其他模块不直接调用编辑器 API。

### 性能要求

- 敲键响应 < 16ms(60fps)
- 文件打开 < 100ms(中等大小)
- 大文件 < 500ms(几万行,自动启用 large file mode)
- AI 补全首字延迟 < 800ms(用 Haiku)
- LSP 跳转定义 < 200ms
- LSP hover < 150ms
- LSP 补全 < 300ms
- 文件树渲染 1000 个文件 < 200ms
- Tab 切换 < 50ms

### 大文件降级

- > 1MB:自动 large file mode,关闭语法高亮、LSP、AI 补全
- > 10MB:拒绝打开

### 编辑器模块 v1 硬约束清单

**核心架构(1-5)**

1. 编辑器底层 100% 基于 Monaco,严禁自己实现编辑器核心
2. LSP 客户端在 Rust 后端实现,通过 stdio JSON-RPC 通信
3. Monaco 通过 Tauri invoke/event 和 Rust 后端通信
4. v1 内置 typescript-language-server,通过 Tauri sidecar 打包
5. **Drafting 编辑器是 VS Code 的增强版,任何文件用外部 VS Code 打开都正常工作**

**字体(6)**

6. **打包 JetBrains Mono**(Apache 2.0 许可证)作为编辑器和终端的默认字体,Settings 可切换到其他字体

**文件身份识别(7-11)**

7. 打开文件时自动识别 FileIdentity
8. 工具生成的文件默认只读,顶部显示警告横条
9. Adapter 文件可写,但 Patchboard 生成的部分(类名、implements、构造函数)受 ts-morph 检测保护,修改时温和提示
10. FileIdentity 通过 Sync Bus 发布,文件树和状态栏自动响应
11. 状态栏底部第二行显示文件身份(关联的 Blueprint、Patchboard Adapter)

**LSP 集成(12-16)**

12. v1 内置 typescript-language-server
13. LSP server 由 Rust 后端管理生命周期
14. LSP server 崩溃自动重启,3 次失败后放弃
15. 工程切换或 Git 分支切换时重启 LSP server(v1 简化方案)
16. LSP 诊断通过 Sync Bus 发布

**AI 补全(17-23)**

17. AI 补全通过 AI Provider Manager 的 `editor.completion` 任务
18. Tab 接受、Esc 拒绝、Cmd+→ 接受词、Cmd+Shift+→ 接受行
19. AI 补全 context 自动注入文件关联 Blueprint 的 Goal/Constraints
20. 触发节流(同一位置 3 秒内不重复)
21. 缓存(相同 context hash 15 分钟内命中)
22. Cmd+K 整段生成,选中代码时显示为 inline diff
23. 每次 AI 补全都有"足迹"图标,显示模型/token/cost

**Tab 和文件管理(24-27)**

24. 多 tab,Cmd+T/Cmd+W/Cmd+1-9
25. 未保存改动有视觉提示,关闭时确认
26. **Cmd+Alt+S 保存所有 tab**
27. 自动保存默认关闭,Settings 可开;崩溃恢复必做

**文件树(28-30)**

28. 右侧面板的文件树,虚拟列表渲染
29. 默认隐藏 `.git/` `node_modules/` `.drafting/` `.atlas/` 等噪音
30. 文件树显示特殊标记(🔌 Adapter / 📋 Blueprint / ⚙ generated / 🔒 privacy)

**命令面板和模式(31-32)**

31. Cmd+Shift+P 命令面板,各模块注册命令,模糊匹配 + 最近使用排序
32. **Zen 焦点模式**:Cmd+K Z 隐藏所有面板,只显示编辑器

**协同(33-34)**

33. 所有"打开文件"请求通过 Sync Bus 的 `EditorCommand::OpenFile` 事件
34. 编辑器不直接调用其他模块 API,通过 Sync Bus 协同

**性能(35-36)**

35. 敲键响应 < 16ms,文件打开 < 100ms,LSP 跳转 < 200ms
36. 大文件(>1MB)启用 large file mode,>10MB 拒绝打开

**搜索(37)**

37. 全局搜索后台异步,显示进度,工程文件数上限 50000(超出警告)

### v1 不做的清单(已列上面)

包括 Vim 模式、自动 format on save、Split editor、多窗口、Notebook、Live Share、远程编辑、Markdown 预览面板、GitLens 风格 Git 集成等。

### v1 工程量预估

**3-4 周**(约 24-32 天):

- Monaco 集成 + 基础配置:3-4 天
- LSP 客户端(Rust + 转发):4-5 天
- typescript-language-server sidecar 打包:2 天
- 文件身份识别 + 状态栏 + 只读保护:2-3 天
- AI 补全 ghost text:3-4 天
- Cmd+K 整段生成:2 天
- 文件树 + 虚拟列表 + 特殊标记:2-3 天
- 命令面板:2 天
- 崩溃恢复 + 自动保存:1-2 天
- Zen 模式 + 全局搜索:1-2 天
- 协同(Sync Bus 事件):1-2 天
- 性能优化和测试:2-3 天

---

## 设计完成

到此为止,Drafting v1 的全部 14 个模块设计完成:

| # | 模块 | 状态 |
|---|---|---|
| 1 | Patchboard | ✅ |
| 2 | Blueprint | ✅ |
| 3 | Atlas | ✅ |
| 4 | Headquarters | ✅ |
| 5 | 三系统协同 + Sync Bus | ✅ |
| 6 | 技术栈选型 | ✅ |
| 7 | v1 范围与开发节奏 | ✅ |
| 8 | Claude 协作开发指南 | ✅ |
| 9 | CLI / 终端 | ✅ |
| 10 | Git 基础 | ✅ |
| 11 | AI Provider Manager | ✅ |
| 12 | 编辑器集成 | ✅ |

可以正式进入开发阶段。下一步建议:

1. **冻结本文档**作为 v1 的设计宪法
2. 在仓库根目录创建 `CLAUDE.md`,内容是本文档(给 Claude Code 用)
3. 按 Part 8 的 6 阶段开发节奏,从**阶段 0(奠基)**开始
4. 第一周:Tauri 2 + React + TypeScript 工程脚手架,Sync Bus 完整实现,IDE 主界面骨架

---

## 文档版本

- 当前版本:v0.1(完成 Patchboard / Blueprint / Atlas / Headquarters / 三系统协同的设计)
- 待补充:Part 11 列出的四个模块
- 完成全部设计后,本文档将作为 CLAUDE.md 使用


---

## 安全审计清单(2026-06-12 安全收尾批次)

| 项 | 状态 | Commit |
|---|---|---|
| P0-1 fs_ops 路径解析硬化(绝对路径 / symlink 逃逸) | ✅ closed | 8e830d6 |
| P0-2 真实 CSP 替换 null(生产严格 + dev 放行 HMR) | ✅ closed | 8313bf8 |
| P0-3 Privacy Filter 最小实现 + AI 审计日志 | ✅ closed | 3769044 |
| P1-4 API key 明文回退硬化(0600 + 高声告警 + .gitignore 保障) | ✅ closed | ceced58 |
| P1-5 BSL 1.1 LICENSE | ⏳ open(用户在 GitHub 上自行添加;参数已定:Licensor=Nebula,Change Date=2030-06-12,Change License=Apache-2.0,Additional Use Grant=个人/非商用生产豁免) |

说明:v1 的 Privacy Filter 为设计三层中的第一层(文件路径黑名单),内容扫描与用户审批留待后续迭代(见 Part 13)。
