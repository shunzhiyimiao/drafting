import { useEffect, useState } from "react";
import { Activity, Map as MapIcon, RefreshCw } from "lucide-react";
import {
  surveyHealth,
  surveyObservability,
  surveyRead,
  surveyRebuild,
  type AtlasHealth,
  type AtlasMap,
  type AtlasObservability,
} from "../../lib/atlas-api";
import { getProjectRoot } from "../../lib/app-bootstrap";

/** Atlas 测绘报告卡(B3)— 每项目一张,三个面板,全部是事实:
 *  事实(测绘缓存)· 健康(language_provider 传感器按需跑,诚实降级)·
 *  观测覆盖(bindings/check-results 聚合 — Drafting 原生 KPI)。
 *  司令部铁律:每个元素都指向下一步行动 —— 重建、跑健康检查。 */
export function AtlasReportCard() {
  const [root, setRoot] = useState<string | null>(null);
  const [map, setMap] = useState<AtlasMap | null>(null);
  const [healthR, setHealthR] = useState<AtlasHealth | null>(null);
  const [obs, setObs] = useState<AtlasObservability | null>(null);
  const [busy, setBusy] = useState<"rebuild" | "health" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getProjectRoot().then(async (r) => {
      setRoot(r);
      try {
        setMap(await surveyRead(r));
        setObs(await surveyObservability(r));
      } catch (e) {
        setError(String(e));
      }
    });
  }, []);

  const rebuild = async () => {
    if (!root) return;
    setBusy("rebuild");
    setError(null);
    try {
      setMap(await surveyRebuild(root));
      setObs(await surveyObservability(root));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const runHealth = async () => {
    if (!root) return;
    setBusy("health");
    setError(null);
    try {
      setHealthR(await surveyHealth(root));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const gateLabel: Record<AtlasHealth["gate"], { text: string; cls: string }> = {
    passed: { text: "编译门通过", cls: "text-success" },
    failed: { text: "编译门失败", cls: "text-error" },
    unavailable: { text: "传感器不可用", cls: "text-text-muted" },
  };

  const routes = map?.rust?.members.flatMap((m) => m.routes) ?? [];

  return (
    <div data-atlas-card className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <MapIcon size={14} className="text-accent" />
        <h3 className="text-sm font-medium text-text-primary">Atlas 测绘</h3>
        {map && (
          <span className="text-[10px] tex-text-muted text-text-muted">
            {new Date(map.generatedAtMs).toLocaleString()}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => void runHealth()}
          disabled={busy !== null}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-text-secondary hover:bg-bg-hover disabled:opacity-50"
        >
          <Activity size={11} />
          {busy === "health" ? "检查中…" : "健康检查"}
        </button>
        <button
          data-atlas-rebuild
          onClick={() => void rebuild()}
          disabled={busy !== null}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          <RefreshCw size={11} className={busy === "rebuild" ? "animate-spin" : ""} />
          {map ? "重建测绘" : "开始测绘"}
        </button>
      </div>

      {error && <p className="text-[10px] text-error mb-2">{error}</p>}

      {!map ? (
        <p className="text-xs text-text-muted">
          还没有测绘数据 — 点「开始测绘」扫描 workspace(纯事实,零 AI)。
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {/* 事实面板 */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">事实</h4>
            <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
              {map.rust && (
                <span>
                  Rust:{map.rust.members.length} 个成员 ·{" "}
                  {map.rust.members.reduce((n, m) => n + m.pubFns.length, 0)} pub fn ·{" "}
                  {map.rust.members.reduce((n, m) => n + m.traitImpls.length, 0)} impl
                </span>
              )}
              {map.ts && (
                <span>
                  TS:{map.ts.packages.length} 个包 ·{" "}
                  {map.ts.packages.reduce((n, p) => n + p.fileCount, 0)} 源文件
                </span>
              )}
              {routes.length > 0 && (
                <div className="mt-1">
                  <span className="text-text-muted">路由表:</span>
                  {routes.slice(0, 6).map((r, i) => (
                    <div key={i} className="font-mono text-[10px]">
                      {r.method} {r.path} → {r.handler}
                    </div>
                  ))}
                  {routes.length > 6 && (
                    <span className="text-text-muted">…共 {routes.length} 条</span>
                  )}
                </div>
              )}
              {map.warnings.map((w, i) => (
                <span key={i} className="text-warning text-[10px]">
                  ⚠ {w}
                </span>
              ))}
            </div>
          </div>

          {/* 健康面板 */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">健康</h4>
            {!healthR ? (
              <p className="text-[11px] text-text-muted">按需运行 — 点「健康检查」。</p>
            ) : (
              <div className="flex flex-col gap-1 text-[11px]">
                <span className={gateLabel[healthR.gate].cls}>
                  {gateLabel[healthR.gate].text}
                </span>
                {healthR.gate === "failed" &&
                  healthR.gateDiagnostics.slice(0, 3).map((d, i) => (
                    <span key={i} className="font-mono text-[10px] text-text-muted truncate">
                      {d}
                    </span>
                  ))}
                {healthR.tests ? (
                  <span
                    className={
                      healthR.tests.failedModules.length > 0 ? "text-error" : "text-success"
                    }
                  >
                    测试:{healthR.tests.testedModules} 个模块
                    {healthR.tests.failedModules.length > 0
                      ? ` · ${healthR.tests.failedModules.length} 个失败`
                      : " · 全过"}
                  </span>
                ) : (
                  <span className="text-text-muted">测试传感器不可用</span>
                )}
              </div>
            )}
          </div>

          {/* 观测覆盖面板 */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
              观测覆盖
            </h4>
            {obs && (
              <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                <span>
                  已绑 criteria:{obs.boundCriteria} / {obs.totalCriteria}
                </span>
                <span
                  className={obs.neverCheckedRatio > 0.5 ? "text-warning" : "text-text-secondary"}
                >
                  从未检查:{Math.round(obs.neverCheckedRatio * 100)}%
                </span>
                <span className="text-text-muted text-[10px]">
                  数据来自 bindings 与 check-results,聚合即事实。
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
