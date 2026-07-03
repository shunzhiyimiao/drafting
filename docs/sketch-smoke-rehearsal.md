# Sketch 冒烟排练记录（2026-07-04）

两锹落地（list/数据绑定 `65af3d0` + 收窄自由拖拽 `c8e7b8e`）后的全链排练。
场地：`/Users/lilingjiao/drafting-smoke` —— 全新、**非 monorepo** 布局（裸 git + 单 package.json + src/，无 workspace、无 tsconfig.base.json）。排练结束保留现场（含一处 validator 报错的最终态）供复查，可随时删除。

## 走过的链

建项目 → 写含 list 的 `sketches/inbox.sketch.json`（itemShape id/subject/avatar，绑 sampleRows）→ 真实 codegen（与 Rust proxy 同协议的 stdio JSON-RPC `generateSketch`，以及 app 内 FileSaved→防抖 regen 两条路径）→ sibling 接线供真数据 → tsc 闸门 → criterion 以钉死文法 `<!-- #01ARZ… sk:sk_inbox/mail-row -->` 绑到 template 节点 → 在运行中的 app 里改 sketch 存盘 → **drift 变红确认**。

## 通过项

- 非 monorepo 项目上 startup 双索引重建（blueprint+binding、sketch，`sketches/` 守卫正常）。
- 画布 list 双实例渲染（K3 canvas 半边；两条 sampleRows 各自成行）。
- marker 读取链路：Inspector CRITERIA 区显示 criterion 且标注 "bound to mail-r…"。
- 编辑 → autosave → `estimator: FileSaved sketches/inbox.sketch.json → 1 criteria drifted` → 重开 feature 后徽章 **DRIFT**（红）。
- 二次编辑 → `0 criteria drifted`：已 stale 的 criterion 不重复报 drift，语义正确。
- codegen 只整体重写 `packages/ui/src/generated/inbox.generated.tsx`；用户 sibling 未被触碰；regen 后 tsc 复绿。
- 过期 handler id → `TS2353`（SketchHandlers 字面量键闸门端到端成立）。
- validator 实时防线：一次误操作把绑定文本拖出 template，Inspector 立刻亮 PROBLEMS(1) "content binds subject outside a list template"。

## 摩擦点清单（交付物）

1. **`packages/ui/tsconfig.json` extends 断裂（决策点，见下节）** —— 非 monorepo 宿主没有 `../../tsconfig.base.json` → TS5083 + lib 缺失级联。在项目根手工补一份 base 后 tsc 全绿：缺口恰好只有这一个文件。
2. **ui 包是孤岛** —— 无 workspace 链接时 `@app/ui` 无法被宿主 `src/` import；react 依赖需 `npm --prefix packages/ui` 就地安装。Rev 2 §6 隐含了 v1 宪法的 pnpm monorepo 假设，Sketch 独立使用时不成立。
3. **`.gitignore` 不存在时不创建** —— `ensure_gitignored` 只对已存在的 .gitignore 追加；fresh git 项目会让 `.sketch-index.json`（纯缓存）被裸 `git add -A` 收进版本库。宪法 Part 12 §25 的"自动维护 .gitignore"没接住"文件不存在"分支。
4. **`.sketch-index.json` 的 `criteriaByNode` 恒空** —— 代码注释声明为 shape-stable 占位；节点→criteria 反向查找实际由 blueprint 绑定索引承担。两个索引一个半满，易误导读者：应либо填充，либо在设计文档里写明"blueprint 侧是权威"。
5. **drift 徽章的挂载缺口（v1.5 S6 既有，非本次引入）** —— DriftDetected 发生时 Blueprint 视图未挂载则事件被错过；视图重挂载渲染 store 缓存的 estimates（旧 PASS），需再次点击 feature 行（openBlueprint → loadEstimates）才刷新。修法方向：StructuredView mount 时无条件 loadEstimates，或给 estimates 加失效标记。
6. **落点规则散在三处** —— `packages/ui/src/generated/<slug>.generated.tsx` 这条路径被 codegen-server（写入）、`blueprint/bindings.rs::resolve_sketch_artifacts`（drift 解析）、`sketch/storage.rs::delete`（删除联动）各自硬编码。任何落点变更是三处同步，宜提为单一约定常量并在 Rev 3+ 声明。
7. **排练自动化摩擦（环境类）** —— 无 Screen Recording 权限，截屏不可用；macOS Accessibility 盲驱可行但有误触风险（本次一次误点造成意外树编辑——反而验证了 validator）。建议：dev-only 的触发保存/查询 estimates 的命令面板项或 tauri 命令，让排练可脚本化。

## 决策报告：`packages/ui` 落点约定 vs 非 monorepo 布局

按纪律未改任何约定；以下为选项与建议，待拍板。

**现状**（Rev 2/3 §6）：`packages/ui/src/generated/` 工具拥有；`packages/ui/` 其余用户拥有；tsconfig `extends ../../tsconfig.base.json`；包名 `<scope>/ui`。隐含假设：宿主是 pnpm monorepo（v1 宪法工程结构）。

**非 monorepo 宿主上的断裂**：extends 目标缺失（tsc 直接死）；无 workspace 链接（包不可被宿主 import）；依赖需就地安装。

| 选项 | 内容 | 代价 |
|---|---|---|
| **A（建议）：脚手架自愈** | `generateSketch` 检测宿主布局——根无 `tsconfig.base.json` 时 ui 包 tsconfig 改为内联完整 compilerOptions（不 extends）；无 workspace 时在 sibling 头注释写明接入方式 | 约定不变，只改脚手架生成逻辑 + 测试；一处改动 |
| B：落点降级 | 非 monorepo 时生成进宿主 `src/ui/generated/` | 改约定本身；摩擦 #6 的三处硬编码要同步改（codegen-server、bindings.rs、storage.rs delete），面大 |
| C：显式拒绝 | 无 workspace 时报错要求先建 monorepo | 最安全但对 Indie Hacker 单项目场景不友好 |

## 排练执行细节（可复现）

- headless codegen：`printf '<json-rpc>' | node packages/codegen-server/dist/codegen-server.cjs`，方法 `generateSketch`，与 Rust `CodegenProxy::call` 同协议。
- app 指向排练项目：备份并改写 `~/.drafting/workspace.json`（结束后已还原）。
- drift 种子：手写 `.blueprint/check-results/<blueprintId>-<criterionId>.json`（verdict=pass），Blueprint 视图打开 feature 使 estimator 装载，再改 sketch 触发。
