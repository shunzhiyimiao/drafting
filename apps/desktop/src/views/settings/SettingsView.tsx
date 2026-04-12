import { useEffect, useState } from "react";
import {
  Cpu,
  Key,
  ToggleLeft,
  ToggleRight,
  Palette,
  Check,
} from "lucide-react";
import { useAiStore } from "../../stores/ai-store";
import {
  useThemeStore,
  THEME_ORDER,
  THEME_META,
} from "../../stores/theme-store";
import { TASK_LABELS, type TaskId, type ProviderId } from "../../types/ai-types";

export function SettingsView() {
  const config = useAiStore((s) => s.config);
  const initialize = useAiStore((s) => s.initialize);
  const setApiKey = useAiStore((s) => s.setApiKey);
  const toggleGlobal = useAiStore((s) => s.toggleGlobal);
  const updateRoute = useAiStore((s) => s.updateRoute);

  const themeVariant = useThemeStore((s) => s.variant);
  const setThemeVariant = useThemeStore((s) => s.setVariant);

  useEffect(() => {
    if (!config) initialize(".");
  }, [config, initialize]);

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <h1 className="text-lg font-bold text-text-primary">Settings</h1>

        {/* Global AI toggle */}
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu size={16} className="text-accent" />
              <div>
                <div className="text-sm font-medium text-text-primary">
                  AI Features
                </div>
                <div className="text-[10px] text-text-muted">
                  Disable to turn off all AI features. Core tools still work.
                </div>
              </div>
            </div>
            <button
              onClick={() => toggleGlobal(!config.globalEnabled)}
              className="text-text-primary"
            >
              {config.globalEnabled ? (
                <ToggleRight size={28} className="text-accent" />
              ) : (
                <ToggleLeft size={28} className="text-text-muted" />
              )}
            </button>
          </div>
        </div>

        {/* Providers */}
        <div className="glass-panel p-4">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            AI Providers
          </h2>
          <div className="flex flex-col gap-3">
            {config.providers.map((p) => (
              <ProviderCard
                key={String(p.id)}
                provider={p}
                onSetKey={(key) => setApiKey(p.id, key)}
              />
            ))}
          </div>
        </div>

        {/* Task Routing */}
        <div className="glass-panel p-4">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            Task Routing
          </h2>
          <div className="flex flex-col gap-2">
            {config.routes.map((route) => (
              <div
                key={String(route.taskId)}
                className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
              >
                <span className="text-xs text-text-primary">
                  {TASK_LABELS[route.taskId as TaskId] ?? String(route.taskId)}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={String(route.providerId)}
                    onChange={(e) =>
                      updateRoute({
                        ...route,
                        providerId: e.target.value as ProviderId,
                      })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded"
                  >
                    {config.providers
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <option key={String(p.id)} value={String(p.id)}>
                          {p.displayName}
                        </option>
                      ))}
                  </select>
                  <select
                    value={route.model}
                    onChange={(e) =>
                      updateRoute({ ...route, model: e.target.value })
                    }
                    className="text-[10px] px-1.5 py-0.5 rounded"
                  >
                    {(
                      config.providers.find(
                        (p) => String(p.id) === String(route.providerId),
                      )?.models ?? []
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="glass-panel p-4">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            <Palette size={12} className="inline mr-1" />
            Theme
          </h2>
          <div className="grid grid-cols-5 gap-2">
            {THEME_ORDER.map((id) => {
              const meta = THEME_META[id];
              return (
                <button
                  key={id}
                  onClick={() => setThemeVariant(id)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${
                    themeVariant === id
                      ? "bg-white/10 border border-accent/40"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-full border border-white/20"
                    style={{ background: meta.swatch }}
                  />
                  <span className="text-[10px] text-text-primary">
                    {meta.label}
                  </span>
                  {themeVariant === id && (
                    <Check size={10} className="text-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Budget */}
        <div className="glass-panel p-4">
          <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Usage
          </h2>
          <div className="text-xs text-text-muted">
            Current month: ${config.currentMonthUsageUsd.toFixed(4)}
            {config.monthlyBudgetUsd != null && (
              <span> / ${config.monthlyBudgetUsd.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  onSetKey,
}: {
  provider: { id: ProviderId; displayName: string; apiKeySet: boolean; enabled: boolean; apiBase: string };
  onSetKey: (key: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");

  const handleSave = () => {
    if (key.trim()) {
      onSetKey(key.trim());
      setKey("");
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-white/3 border border-white/5">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${provider.enabled ? "bg-success" : "bg-text-muted"}`}
        />
        <span className="text-xs font-medium text-text-primary">
          {provider.displayName}
        </span>
        {provider.apiKeySet && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/20 text-success">
            key set
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-..."
            type="password"
            autoFocus
            className="w-40 px-2 py-0.5 text-[10px] rounded"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            onClick={handleSave}
            className="text-success hover:text-success/80"
          >
            <Check size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
        >
          <Key size={10} />
          {provider.apiKeySet ? "Update Key" : "Set Key"}
        </button>
      )}
    </div>
  );
}
