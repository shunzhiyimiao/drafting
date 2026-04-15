import { useEffect, useState } from "react";
import {
  Globe,
  Palette,
  Cpu,
  Code,
  Info,
  ToggleLeft,
  ToggleRight,
  Key,
  Check,
  RotateCcw,
} from "lucide-react";
import { t } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settings-store";
import { useAiStore } from "../../stores/ai-store";
import {
  useThemeStore,
  THEME_ORDER,
  THEME_META,
} from "../../stores/theme-store";
import type { ProviderId } from "../../types/ai-types";

type SettingsTab = "general" | "appearance" | "ai" | "editor" | "about";

const tabDefs: { id: SettingsTab; icon: typeof Globe; labelKey: string }[] = [
  { id: "general", icon: Globe, labelKey: "settings.tab.general" },
  { id: "appearance", icon: Palette, labelKey: "settings.tab.appearance" },
  { id: "ai", icon: Cpu, labelKey: "settings.tab.ai" },
  { id: "editor", icon: Code, labelKey: "settings.tab.editor" },
  { id: "about", icon: Info, labelKey: "settings.tab.about" },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  useSettingsStore((s) => s.locale);

  return (
    <div className="flex h-full">
      <div className="w-48 bg-bg-secondary border-r border-white/5 flex flex-col shrink-0 py-2">
        <div className="px-4 py-2 text-sm font-bold text-text-primary">
          {t("settings.title")}
        </div>
        {tabDefs.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-xs transition-colors ${
              activeTab === id
                ? "bg-white/8 text-text-primary border-r-2 border-accent"
                : "text-text-muted hover:text-text-secondary hover:bg-white/3"
            }`}
          >
            <Icon size={14} />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "ai" && <AiTab />}
          {activeTab === "editor" && <EditorTab />}
          {activeTab === "about" && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>{t("settings.tab.general")}</SectionTitle>
      <SettingsRow label={t("settings.language")}>
        <div className="flex gap-2">
          {(["zh", "en"] as const).map((loc) => (
            <button
              key={loc}
              onClick={() => setLocale(loc)}
              className={`px-4 py-2 text-xs rounded-lg transition-all ${
                locale === loc
                  ? "glass-button-primary font-medium"
                  : "glass-button text-text-secondary"
              }`}
            >
              {loc === "zh" ? "中文" : "English"}
              {locale === loc && <Check size={12} className="inline ml-1.5" />}
            </button>
          ))}
        </div>
      </SettingsRow>
    </div>
  );
}

function AppearanceTab() {
  const appearance = useSettingsStore((s) => s.appearance);
  const updateAppearance = useSettingsStore((s) => s.updateAppearance);
  const resetAppearance = useSettingsStore((s) => s.resetAppearance);
  const themeVariant = useThemeStore((s) => s.variant);
  const setThemeVariant = useThemeStore((s) => s.setVariant);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionTitle>{t("settings.tab.appearance")}</SectionTitle>
        <button
          onClick={resetAppearance}
          className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary glass-button px-2 py-1 rounded-lg"
        >
          <RotateCcw size={10} />
          {t("common.reset")}
        </button>
      </div>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-3 block">
          {t("settings.theme")}
        </label>
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
                <span className="text-[10px] text-text-primary">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <SettingsRow label={t("settings.fontFamily")}>
        <select
          value={appearance.fontFamily}
          onChange={(e) => updateAppearance({ fontFamily: e.target.value })}
          className="w-56 px-2 py-1.5 text-xs rounded-lg"
        >
          <option value="JetBrains Mono, ui-monospace, monospace">JetBrains Mono</option>
          <option value="Fira Code, ui-monospace, monospace">Fira Code</option>
          <option value="SF Mono, ui-monospace, monospace">SF Mono</option>
          <option value="Menlo, ui-monospace, monospace">Menlo</option>
          <option value="Cascadia Code, ui-monospace, monospace">Cascadia Code</option>
          <option value="ui-monospace, monospace">System Mono</option>
        </select>
      </SettingsRow>

      <SettingsRow label={t("settings.uiFontSize")}>
        <div className="flex items-center gap-2">
          <input type="range" min={11} max={18} value={appearance.uiFontSize}
            onChange={(e) => updateAppearance({ uiFontSize: parseInt(e.target.value) })}
            className="w-32 accent-accent" />
          <span className="text-xs text-text-primary w-8 text-right">{appearance.uiFontSize}px</span>
        </div>
      </SettingsRow>

      <SettingsRow label={t("settings.fontSize")}>
        <div className="flex items-center gap-2">
          <input type="range" min={10} max={24} value={appearance.fontSize}
            onChange={(e) => updateAppearance({ fontSize: parseInt(e.target.value) })}
            className="w-32 accent-accent" />
          <span className="text-xs text-text-primary w-8 text-right">{appearance.fontSize}px</span>
        </div>
      </SettingsRow>

      <SettingsRow label={t("settings.fontColor")}>
        <div className="flex items-center gap-2">
          <input type="color" value={appearance.editorFontColor}
            onChange={(e) => updateAppearance({ editorFontColor: e.target.value })}
            className="w-8 h-8 rounded border-none cursor-pointer bg-transparent" />
          <span className="text-xs text-text-muted font-mono">{appearance.editorFontColor}</span>
        </div>
      </SettingsRow>

      <SettingsRow label={t("settings.terminalFontColor")}>
        <div className="flex items-center gap-2">
          <input type="color" value={appearance.terminalFontColor}
            onChange={(e) => updateAppearance({ terminalFontColor: e.target.value })}
            className="w-8 h-8 rounded border-none cursor-pointer bg-transparent" />
          <span className="text-xs text-text-muted font-mono">{appearance.terminalFontColor}</span>
        </div>
      </SettingsRow>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-2 block">
          {t("settings.preview")}
        </label>
        <div className="p-3 rounded-lg bg-black/20" style={{
          fontFamily: appearance.fontFamily, fontSize: appearance.fontSize, color: appearance.editorFontColor,
        }}>
          <div>{"// " + t("settings.preview")}</div>
          <div>{"export function hello(): string {"}</div>
          <div>{'  return "Drafting";'}</div>
          <div>{"}"}</div>
        </div>
        <div className="mt-2 p-3 rounded-lg bg-black/30" style={{
          fontFamily: appearance.fontFamily, fontSize: appearance.fontSize, color: appearance.terminalFontColor,
        }}>
          <div>$ drafting --version</div>
          <div>Drafting v0.1.0</div>
        </div>
      </div>
    </div>
  );
}

function AiTab() {
  const config = useAiStore((s) => s.config);
  const initialize = useAiStore((s) => s.initialize);
  const setApiKey = useAiStore((s) => s.setApiKey);
  const toggleGlobal = useAiStore((s) => s.toggleGlobal);
  const updateRoute = useAiStore((s) => s.updateRoute);

  useEffect(() => { if (!config) initialize("."); }, [config, initialize]);

  if (!config) return <div className="text-text-muted text-xs">{t("common.loading")}</div>;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>{t("settings.tab.ai")}</SectionTitle>

      <div className="glass-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">{t("settings.ai.globalToggle")}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{t("settings.ai.globalToggleDesc")}</div>
          </div>
          <button onClick={() => toggleGlobal(!config.globalEnabled)}>
            {config.globalEnabled ? <ToggleRight size={28} className="text-accent" /> : <ToggleLeft size={28} className="text-text-muted" />}
          </button>
        </div>
      </div>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-3 block">{t("settings.ai.providers")}</label>
        <div className="flex flex-col gap-2">
          {config.providers.map((p) => (
            <ProviderRow key={String(p.id)} provider={p} onSetKey={(key) => setApiKey(p.id, key)} />
          ))}
        </div>
      </div>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-3 block">{t("settings.ai.taskRouting")}</label>
        <div className="flex flex-col gap-1.5">
          {config.routes.map((route) => (
            <div key={String(route.taskId)} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
              <span className="text-xs text-text-primary">{t(`task.${route.taskId}`)}</span>
              <div className="flex items-center gap-2">
                <select value={String(route.providerId)}
                  onChange={(e) => updateRoute({ ...route, providerId: e.target.value as ProviderId })}
                  className="text-[10px] px-1.5 py-0.5 rounded">
                  {config.providers.filter((p) => p.enabled).map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>{p.displayName}</option>
                  ))}
                </select>
                <select value={route.model}
                  onChange={(e) => updateRoute({ ...route, model: e.target.value })}
                  className="text-[10px] px-1.5 py-0.5 rounded">
                  {(config.providers.find((p) => String(p.id) === String(route.providerId))?.models ?? []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">{t("settings.ai.usage")}</label>
        <div className="text-xs text-text-muted">
          {t("settings.ai.currentMonth")}: ${config.currentMonthUsageUsd.toFixed(4)}
          {config.monthlyBudgetUsd != null && <span> / ${config.monthlyBudgetUsd.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  );
}

function ProviderRow({ provider, onSetKey }: {
  provider: { id: ProviderId; displayName: string; apiKeySet: boolean; enabled: boolean };
  onSetKey: (key: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const handleSave = () => { if (key.trim()) { onSetKey(key.trim()); setKey(""); setEditing(false); } };

  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/3 border border-white/5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${provider.enabled ? "bg-success" : "bg-text-muted"}`} />
        <span className="text-xs font-medium text-text-primary">{provider.displayName}</span>
        {provider.apiKeySet && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/20 text-success">{t("settings.ai.keySet")}</span>}
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." type="password" autoFocus
            className="w-44 px-2 py-1 text-[10px] rounded"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }} />
          <button onClick={handleSave} className="text-success"><Check size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover">
          <Key size={10} />
          {provider.apiKeySet ? t("settings.ai.updateKey") : t("settings.ai.setKey")}
        </button>
      )}
    </div>
  );
}

function EditorTab() {
  const appearance = useSettingsStore((s) => s.appearance);
  const updateAppearance = useSettingsStore((s) => s.updateAppearance);

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>{t("settings.tab.editor")}</SectionTitle>
      <SettingsRow label={t("settings.editor.tabSize")}>
        <select value={appearance.editorTabSize}
          onChange={(e) => updateAppearance({ editorTabSize: parseInt(e.target.value) })}
          className="w-20 px-2 py-1.5 text-xs rounded-lg">
          <option value="2">2</option><option value="4">4</option><option value="8">8</option>
        </select>
      </SettingsRow>
      <SettingsRow label={t("settings.editor.wordWrap")}>
        <button onClick={() => updateAppearance({ editorWordWrap: !appearance.editorWordWrap })}>
          {appearance.editorWordWrap ? <ToggleRight size={24} className="text-accent" /> : <ToggleLeft size={24} className="text-text-muted" />}
        </button>
      </SettingsRow>
      <SettingsRow label={t("settings.editor.minimap")}>
        <button onClick={() => updateAppearance({ editorMinimap: !appearance.editorMinimap })}>
          {appearance.editorMinimap ? <ToggleRight size={24} className="text-accent" /> : <ToggleLeft size={24} className="text-text-muted" />}
        </button>
      </SettingsRow>
      <SettingsRow label={t("settings.editor.lineNumbers")}>
        <button onClick={() => updateAppearance({ editorLineNumbers: !appearance.editorLineNumbers })}>
          {appearance.editorLineNumbers ? <ToggleRight size={24} className="text-accent" /> : <ToggleLeft size={24} className="text-text-muted" />}
        </button>
      </SettingsRow>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>{t("settings.tab.about")}</SectionTitle>
      <div className="glass-panel p-6 flex flex-col items-center text-center gap-3">
        <h2 className="text-2xl font-bold text-text-primary tracking-tight">Drafting</h2>
        <p className="text-xs text-text-secondary max-w-md">{t("settings.about.desc")}</p>
        <div className="flex items-center gap-4 text-[10px] text-text-muted mt-2">
          <span>{t("settings.about.version")}: 0.1.0</span>
          <span>{t("settings.about.techStack")}: Tauri 2 + React + Rust</span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-text-primary">{children}</h2>;
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-xs text-text-primary">{label}</span>
      {children}
    </div>
  );
}
