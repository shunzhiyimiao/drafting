# 标记锹（text-as-truth）决策与摩擦日志（2026-07-08 ～ 07-10）

锹 A 全程记录，交付物之一。提交序列：A1 `7f3c2ee` → A2 `d0b6c51` → A3 `3e8074f` → A4 `a55146b` → A5 `53672c4` → A6/A7（本提交）。每阶段独立 commit、CI 绿后进下一阶段。

## 决策（按发生顺序）

1. **Sketch 实体也走 `sk:id`**（任务书未明说）：criterion refs / byFeature 索引 / find_by_id 都引用 sketch id，实体 id 必须始终持久——落为 `<Sketch sk:id="…">`；缺失时在编辑器打开路径补铸（沿用"实体 id 为空即铸"的既有语义，从 Rust heal 移到前端 open）。
2. **属性文法三处扩展**（迁移等价强制，constraint 23——否则 v2 数据静默丢失或迁移失败）：`pad` 三形（`{N}`｜`"v h"`｜`"t r b l"`，打印器取最短形镜像 paddingClasses 折叠）；新增 `border="thin|thick <color>"`；`intent="navigate:<sketchId>"` 冒号携带目标。已入 Rev 4 §3.2。
3. **semantics 不入方言**：现实无写入路径；迁移遇到即响亮拒绝原文件不动，而非静默丢弃。
4. **A2/A4 顺序钉子**：迁移的启动接线若先于 Rust 读 `.sketch` 落地，改名 `.bak` 会把运行中的 app 弄哑——迁移器本体随 A2 交付（独立可测），启动接线随 A4 同一提交。阶段字面顺序保持，每个 commit 自洽绿。
5. **A4 架构收窄**：text-as-truth 后前端自己解析文本（sketch-core 本就是其依赖），Spec 树不再跨 Tauri 边界——Rust serde 镜像整体退役（含 round-trip 测试，其保真义务由方言 parse∘print 定律接管），K3 推论从"Rust 不算 className"延伸为"Rust 不解析方言"。结构经 `scanSketches`/`printNewSketch` RPC。
6. **bindings 的 id→file 解析改走 `.sketch-index.json` 缓存**（新增 `idToFile`）：文件级跨域读先例保持，但经缓存；缓存缺失降级为 dangling 信号。
7. **等价比较需值规范化**：v2 JSON 的多种拼写（intent 缺省 ≡ none、none-border ≡ 无、空 placeholder/style ≡ 无）在方言里只有一种规范形——`canonicalizeForMarkup` 落 sketch-core（单实现），迁移器比较前调用；键序无关比较用排序键序列化。
8. **单一 undo 栈的载体 = Monaco model**：结构化编辑经注册的 bufferWriter 用 `executeEdits` 写回（pushUndoStop 包裹成单撤销单元），与打字天然同栈；无 buffer 时（harness/画布独用）降级为纯状态写（功能完整，无 undo）。
9. **跨 reprint 的选中身份 = 树路径重映射**：临时 id 按文档序重排，路径（子索引 + `-1` 表示进模板）在变异树上求出、重解析树上回查。
10. **文档报错期间结构化编辑禁用**：在陈旧树上编辑再打印会覆盖用户文本——画布保留最后好树渲染，palette/Wrap 置灰，Monaco markers 指错。
11. **保存原样文本**（含不规范/不可解析态）：拒绝保存=丢数据；出方言的保存在下游响亮降级（scan 点名、codegen 记日志），文本修好即愈合。
12. **B 锹按排程铁律截断**：7/10 收工线时 A 锹尚在 A4/A5，B（Atlas 测绘 MVP）未开工——直接停，顺延，不 gate 任何事。任务书 B1–B5 的设计要点原样留存于任务描述，待重新排程。

## 摩擦（供后续锹参考）

1. **markup.ts 参考实现晚到**：任务书写"用户会提供"，开工时全盘搜索无果，阶段 0 完成后阻塞半天等文件（后落于 ~/Downloads）。建议：交接文件随任务书同步放进仓库或指明路径。
2. **sketch-core test script 只跑单文件**：A1 的 markup 套件本地绿但 CI 不可见（`tsx --test src/sketch-core.test.ts`）——A3 修为 glob。教训：新增测试文件时核对 CI 实际执行的命令。
3. **TS 的 never-CFA 对类方法不可靠**：`p.fail(): never` 后 TS 不收窄联合类型（多处），显式 `throw new MarkupError(...)` 才稳定。参考实现同款结构在 vitest/宽松配置下没暴露。
4. **serde 内部标签枚举丢 `kind`**（A1 期间在 v2 镜像上遇到，现镜像已退役，记档）：`template: Container` 直接序列化会丢 `kind:"stack"`——Sketch.root 的既有解法（持 Node + load 校验 stack-ness）是正确模式。
5. **`d:Sample` 布尔值的拼写**：`{}` 只许数字（定律），裸属性无法表达显式 false——落为 `"true"/"false"`（shape 定型无歧义）。
6. **生成文件的 data-sk 临时 id 抖动**（已记 Rev 4 §6）：上游插节点使后续 `~N` 平移，write-only 生成文件在无引用节点上出 diff——可接受噪音，未修。
7. **vite 长寿进程**：7/4 遗留 vite 占 1420 一周（tauri 二进制已死、vite 独活）——pkill "tauri dev" 不杀 vite 子进程，需单独清。
8. **迁移报告的可见性通道**：sync-bus 桥只递 bus 事件，迁移报告走独立 Tauri emit——notification-bridge 现在组合两个 unlisten。

## 验收记录

- 方言定律：28 测（16 换皮 + 扩展），kitchen-sink parse∘print≡id + 不动点。
- 迁移：全保真（四边 pad/border/navigate 目标/typed 样例行/全 ULID）、响亮拒绝、幂等，3 测。
- persist-on-need：策略逐情形 + 幂等 + 既有 ULID 不动，4 测。
- Rust：152 测（文本 I/O 路径防护、索引 idToFile、bindings 走缓存）。
- 单一 undo 栈（A5 验收）：headless Chrome e2e——Inspector 级编辑、一次拖拽、打字，均 ⌘Z 撤销且树/文本同步回退、恢复规范形。
- 全套：sketch-core 66 / codegen-server 22 / desktop 15 / Rust 152 / 双侧 tsc 干净。
