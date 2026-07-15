/**
 * Fixture generator (P3.1): SYNTHETIC screenshots — no real data, no
 * licensing questions, regenerable at will. Seven archetypes per the
 * ruling: the five common classes + one deliberately-inexpressible + one
 * text-dense. Renders plain HTML in headless Chrome → PNG.
 *
 *   npx tsx evals/transcribe/make-fixtures.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  path.join(process.cwd(), "apps/desktop/package.json"),
);
// puppeteer-core lives in no workspace package; resolve from the harness
// install if present, else instruct.
let puppeteer: typeof import("puppeteer-core");
try {
  puppeteer = require("puppeteer-core");
} catch {
  console.error(
    "puppeteer-core 不可用 — 在任一目录 npm i puppeteer-core@23 后用 NODE_PATH 指向它,或直接用 scratchpad 的安装。",
  );
  process.exit(1);
}

const OUT = path.join("evals", "transcribe", "fixtures");

const page = (title: string, body: string, width = 1200) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title><style>
  * { margin: 0; box-sizing: border-box; font-family: -apple-system, "Segoe UI", sans-serif; }
  body { background: #f6f7f9; color: #1a2233; width: ${width}px; }
  .row { display: flex; } .col { display: flex; flex-direction: column; }
  .card { background: #fff; border: 1px solid #e3e6eb; border-radius: 10px; padding: 16px; }
  button { border: 0; border-radius: 8px; padding: 10px 18px; font-size: 14px; }
  .primary { background: #3b6cf0; color: #fff; }
  .ghost { background: transparent; color: #3b6cf0; }
  input { border: 1px solid #cdd3dd; border-radius: 8px; padding: 10px 12px; font-size: 14px; width: 100%; }
  label { font-size: 12px; color: #5a6577; }
  h1 { font-size: 22px; } h2 { font-size: 17px; } h3 { font-size: 14px; }
  .muted { color: #7a8494; font-size: 12px; }
</style></head><body>${body}</body></html>`;

const FIXTURES: Record<string, { html: string; width: number; height: number }> = {
  dashboard: {
    width: 1200,
    height: 760,
    html: page(
      "CRM Dashboard",
      `<div class="col" style="height:760px">
        <div class="row" style="background:#fff;border-bottom:1px solid #e3e6eb;padding:14px 20px;justify-content:space-between;align-items:center">
          <h1>客户管理台</h1>
          <div class="row" style="gap:10px"><input placeholder="搜索客户…" style="width:220px"><button class="primary">新建客户</button></div>
        </div>
        <div class="row" style="flex:1">
          <div class="col" style="width:220px;background:#fff;border-right:1px solid #e3e6eb;padding:16px;gap:12px">
            <h3>导航</h3><div>首页</div><div>客户</div><div>订单</div><div>报表</div><div>设置</div>
          </div>
          <div class="col" style="flex:1;padding:20px;gap:16px">
            <div class="row" style="gap:16px">
              <div class="card" style="flex:1"><h3>总客户数</h3><h1>1,284</h1><div class="muted">较上月 +4.2%</div></div>
              <div class="card" style="flex:1"><h3>本月成交</h3><h1>¥86,400</h1><div class="muted">较上月 +12%</div></div>
              <div class="card" style="flex:1"><h3>转化率</h3><h1>23%</h1><div class="muted">较上月 -1.1%</div></div>
            </div>
            <div class="card"><h2>最近活动</h2><div class="muted" style="margin-top:8px">王芳 签署了年度合同</div><div class="muted">李明 新建了询价单</div><div class="muted">Acme Ltd. 升级为企业版</div></div>
          </div>
        </div>
      </div>`,
    ),
  },
  login: {
    width: 900,
    height: 640,
    html: page(
      "Login",
      `<div class="row" style="height:640px;align-items:center;justify-content:center">
        <div class="card col" style="width:360px;gap:14px">
          <h1>欢迎回来</h1>
          <div class="col" style="gap:6px"><label>邮箱</label><input placeholder="you@example.com"></div>
          <div class="col" style="gap:6px"><label>密码</label><input type="password" placeholder="••••••••"></div>
          <button class="primary">登录</button>
          <button class="ghost">忘记密码?</button>
        </div>
      </div>`,
    ),
  },
  list: {
    width: 1000,
    height: 720,
    html: page(
      "Inbox",
      `<div class="col" style="padding:20px;gap:12px">
        <div class="row" style="justify-content:space-between;align-items:center"><h1>收件箱</h1><button class="primary">写邮件</button></div>
        ${["周报请查收|王芳|09:24", "合同定稿 v3|法务组|昨天", "服务器告警已恢复|运维机器人|昨天", "Q3 预算讨论|陈立|周一", "新人入职流程|HR|上周"]
          .map((r) => {
            const [t, f, d] = r.split("|");
            return `<div class="card row" style="justify-content:space-between;align-items:center"><div class="col" style="gap:4px"><h3>${t}</h3><div class="muted">${f}</div></div><div class="muted">${d}</div></div>`;
          })
          .join("")}
      </div>`,
    ),
  },
  settings: {
    width: 900,
    height: 700,
    html: page(
      "Settings",
      `<div class="col" style="padding:24px;gap:16px;max-width:640px">
        <h1>账户设置</h1>
        <div class="card col" style="gap:12px"><h2>基本信息</h2>
          <div class="col" style="gap:6px"><label>显示名</label><input value="李凌"></div>
          <div class="col" style="gap:6px"><label>邮箱</label><input value="li@example.com"></div>
          <button class="primary" style="align-self:flex-start">保存修改</button></div>
        <div class="card col" style="gap:12px"><h2>安全</h2>
          <div class="col" style="gap:6px"><label>当前密码</label><input type="password"></div>
          <div class="col" style="gap:6px"><label>新密码</label><input type="password"></div>
          <button class="primary" style="align-self:flex-start">更新密码</button></div>
      </div>`,
    ),
  },
  "mobile-detail": {
    width: 390,
    height: 800,
    html: page(
      "Product",
      `<div class="col" style="height:800px">
        <div style="height:300px;background:#d7dde7;display:flex;align-items:center;justify-content:center;color:#8a93a5">商品图</div>
        <div class="col" style="padding:16px;gap:10px;flex:1">
          <h1>便携咖啡手冲壶</h1><h2 style="color:#3b6cf0">¥228</h2>
          <div class="muted">304 不锈钢 · 600ml · 鹅颈细口</div>
          <div class="card"><h3>用户评价</h3><div class="muted">"出水稳定,新手友好" — 4.8 分</div></div>
        </div>
        <div class="row" style="padding:12px 16px;gap:10px;border-top:1px solid #e3e6eb">
          <button class="ghost" style="flex:1">加入购物车</button><button class="primary" style="flex:1">立即购买</button>
        </div>
      </div>`,
      390,
    ),
  },
  inexpressible: {
    width: 1100,
    height: 700,
    html: page(
      "Analytics",
      `<div class="col" style="padding:20px;gap:16px">
        <h1>流量分析</h1>
        <div class="row" style="gap:16px">
          <div class="card" style="flex:2"><h2>近 30 天访问趋势</h2>
            <svg width="100%" height="220" viewBox="0 0 600 220"><polyline fill="none" stroke="#3b6cf0" stroke-width="3" points="0,180 60,140 120,150 180,90 240,110 300,60 360,80 420,40 480,70 540,30 600,50"/><line x1="0" y1="200" x2="600" y2="200" stroke="#cdd3dd"/></svg></div>
          <div class="card col" style="flex:1;gap:10px"><h2>来源占比</h2>
            <svg width="160" height="160" viewBox="0 0 42 42" style="align-self:center"><circle r="15.9" cx="21" cy="21" fill="none" stroke="#3b6cf0" stroke-width="8" stroke-dasharray="60 40"/><circle r="15.9" cx="21" cy="21" fill="none" stroke="#e8b93b" stroke-width="8" stroke-dasharray="25 75" stroke-dashoffset="-60"/></svg>
            <div class="muted">直接访问 60% · 搜索 25% · 其他 15%</div></div>
        </div>
        <div class="card row" style="gap:14px;align-items:center">
          <video width="200" height="112" poster="" style="background:#1a2233;border-radius:6px"></video>
          <div class="col" style="gap:6px"><h3>产品发布会回放</h3><div class="muted">42:17 · 地图/视频/图表均无对应 token,考验就近映射或丢弃</div></div>
        </div>
      </div>`,
    ),
  },
  "text-dense": {
    width: 900,
    height: 820,
    html: page(
      "Terms",
      `<div class="col" style="padding:28px;gap:12px;max-width:720px">
        <h1>服务条款</h1><div class="muted">最近更新:2026 年 7 月 1 日</div>
        <h2>1. 服务范围</h2>
        <p style="font-size:13px;line-height:1.7">本服务按"现状"提供,包括但不限于草图转写、界面生成与验收清单管理。用户理解并同意,生成结果的视觉保真由主题系统决定,平台不对像素级还原作出承诺。</p>
        <h2>2. 数据与隐私</h2>
        <p style="font-size:13px;line-height:1.7">粘贴的图像仅用于当次结构转写,平台不存储原始像素,不将其用于模型训练。审计日志仅记录时间、尺寸与落点等元数据。</p>
        <h2>3. 用户义务</h2>
        <p style="font-size:13px;line-height:1.7">用户不得转写含有他人隐私信息的截图。因违规使用产生的责任由用户自行承担。</p>
        <div class="row" style="gap:10px;margin-top:8px"><button class="primary">同意并继续</button><button class="ghost">下载 PDF</button></div>
      </div>`,
    ),
  },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new" as never,
  });
  const tab = await browser.newPage();
  for (const [name, f] of Object.entries(FIXTURES)) {
    await tab.setViewport({ width: f.width, height: f.height });
    await tab.setContent(f.html, { waitUntil: "domcontentloaded" });
    const file = path.join(OUT, `${name}.png`);
    await tab.screenshot({ path: file as `${string}.png` });
    console.log("✓", file);
  }
  await browser.close();
}

void main();
