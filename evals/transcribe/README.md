# Paste 转写评测(P3.1)

**开发工具,不进产品。** 直调 Anthropic API(`ANTHROPIC_API_KEY` 环境变量);
产品级 paste(P3.2)另走 AI Provider Manager + `sketchTranscribe` 任务。

## 跑法

```bash
ANTHROPIC_API_KEY=sk-... npx tsx evals/transcribe/run.ts            # 全量
ANTHROPIC_API_KEY=sk-... npx tsx evals/transcribe/run.ts login      # 单张
npx tsx evals/transcribe/run.ts --score-only                        # 只重算分(用上次的转写输出)
```

报告落 `evals/transcribe/report.md` + `report.json`。
**测量纪律:报告头记录 模型版本 + prompt hash + 日期,跨期对比必须三元组一致。**

## 夹具与 golden

- `fixtures/<name>.png` — 合成截图(`npx tsx evals/transcribe/make-fixtures.ts` 再生成)。
  七类:dashboard / login / list / settings / mobile-detail /
  inexpressible(故意含图表、视频等不可表达元素)/ text-dense。
- `goldens/<name>.sketch` — **人工手写**的期望结构(字母表表达力压力测试;
  每个"写不出来"的瞬间记入摩擦日志)。缺 golden 的夹具报告为 `no-golden`,
  转写照跑,只是不打分。

## 评分(全部确定性)

先过门:方言 parse + validate;**输出含任何 `sk:id` 一律记 invalid(AI 永不铸造身份)**。
- **kind F1**:节点 kind 多重集的 P/R/F1;
- **父子边 F1**:(parent.kind → child.kind) 边多重集的 P/R/F1;
- **文本逐字率**:golden 可见文本(Text 内容/Button 标签/Input label 与 placeholder)
  在输出中逐字命中的召回率。

## 隐私(法 4 摘录)

夹具全部合成,无真实数据;评测输出不含像素;转写缓存(`out/`)只存 markup 文本。
