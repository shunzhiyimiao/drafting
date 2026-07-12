# Atlas 测绘 — Mapping v1(B 锹 MVP)

**Status:** v1 落库(2026-07-13,B1–B5)。原任务书于 2026-07-10 按排程铁律截断顺延,本次回场按原文执行。

Atlas 是四层模型的**描述性回边**(看明白):它只读现状,不生成、不修改、不运行代码。测绘(mapping)是 Atlas 的工程级证据面 —— File Map 看单文件,测绘看整个 workspace。

## 1. 两级输出教义(宪法级)

| 级 | 定义 | 核准 | v1 状态 |
|---|---|---|---|
| **事实级(fact)** | 可从源码/清单**直接读出**的信息:成员、依赖声明、pub 项、trait impl、路由字面量、import 边 | 无需核准,直接展示 | ✅ 本 MVP 的全部 |
| **提案级(proposal)** | 需要推断的判断:「这像一个 adapter」「这组该归一类」 | proposed-only,**人升 declared** | ⛔ B 阶段 2,未开工 |

v1 硬禁令:**任何 LLM 调用、任何 adapter 候选、任何「像是」判断**都不得进入测绘输出。确定性系统处理可测量的;语义歧义留给带核准环节的后续阶段。

## 2. 采集器(B1)

语言分工与 K3 同构 —— 谁的语言谁采集,Rust 编排:

**Rust 腿**(`apps/desktop/src-tauri/src/atlas/survey.rs`):
- `cargo metadata --format-version 1 --no-deps` 子进程(与编译门传感器同类)→ workspace 成员、声明依赖(排序去重;声明即事实,不做版本解析);
- syn 扫描每个成员的 `src/**/*.rs` → pub fn / pub struct / pub trait 清单、trait impl 表(`impl Trait for Type`,各取末段)、axum 形路由表(`.route("字面量", get(handler))`,方法助手白名单 get/post/put/delete/patch/head/options/any;动态路径、merge/nest 按设计不在 v1);
- 解析失败的文件降级进 warnings,绝不猜。

**TS 腿**(`packages/codegen-server/src/generators/atlas-scan.ts`,RPC `atlasScanTs`):
- package.json 事实(根 + packages/* + apps/* 一层):name、依赖名;
- `ts.preProcessFile` 词法级 import 提取(零类型检查):相对 import 解析成文件→文件内部边(ts/tsx/index/js→ts 候选),裸说明符收进外部 import 清单(scoped 包取前两段);
- 有界:每包 5000 文件上限;全部排序,输出确定性。

**接缝**:两条腿都是「可用→数据 / 不可用→None + warnings」的独立降级单元(language_provider 式),未来语言腿可插。

## 3. 存储(B2)

`.atlas/map.json` = **纯派生缓存**:重建即得、不进 Git(启动时 idempotent 追加 .gitignore),与 `.sketch-index.json` 同教义。命令:`atlas_survey_rebuild`(跑两腿+落盘)、`atlas_survey_read`(读缓存,None=从未测绘)。

## 4. 司令部报告卡(B3)

每项目一张(`AtlasReportCard.tsx`),三面板,每个元素指向行动:
- **事实**:成员/包计数、pub fn/impl 总数、路由表(截断显示)、测绘自身的降级警告;
- **健康**:按需跑(不自动),**复用** language_provider 传感器 —— 编译门(provider 择路:cargo check / tsc)+ cargo test 模块桶;沿用其诚实降级三态(通过/失败/**不可用≠失败**);
- **观测覆盖**:已绑 criteria / 总数、never-checked 比例 —— 聚合自既有 bindings 与 check-results,零新记账,Drafting 原生 KPI。

## 5. 测试(B4)

- Rust:`testdata/atlas/mini-crate`(永不编译的语法 fixture;内置 axum 形替身,替身的 pub 项本身也是事实并被断言)→ syn 扫描全清单精确断言 + 罐装 cargo metadata JSON 解析断言(非成员过滤、依赖排序去重);
- TS:测试内临时 workspace → 包清单/内部边/外部 import 确定性断言 + node_modules 排除 + 二次扫描字节等价。

## 6. B 阶段 2(明确未开工)

规则化 adapter 候选检测:每条命中标注**规则号**(可追溯、可关闭);LLM 仅用于**分组命名**(提案级,人升 declared)。在两级教义的提案级落地之前,测绘的一切输出保持事实级。

## 7. 摩擦/决策日志(本次回场)

- 决策:cargo metadata 走子进程 + 手写 serde 切片,不引 `cargo_metadata` crate(依赖面最小;与传感器同类);
- 决策:fixture 替身(Router/get/post)的 pub 项**入册**——采集器报告"有什么",不报告"该有什么";测试期望据此修正;
- 决策:路由 handler 取路径末段,非路径表达式记 `<expr>`(事实级的诚实上限);
- 摩擦:TestReport 字段私有 → 加两个只读 getter(tested_count/failed_module_names),不动其序列化;
- 摩擦:老配置缺新任务路由的问题在 AI 批次已顺手修(ensure_builtins 补路由),测绘命令无此坑。
