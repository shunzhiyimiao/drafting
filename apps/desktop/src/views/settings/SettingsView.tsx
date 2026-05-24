import { useEffect, useMemo, useState } from "react";
import {
  Globe,
  Palette,
  Cpu,
  Code,
  Info,
  ToggleLeft,
  ToggleRight,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Copy as CopyIcon,
  Edit3,
  Zap,
  Download,
  X,
  AlertCircle,
} from "lucide-react";
import { useT } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settings-store";
import { useAiStore } from "../../stores/ai-store";
import {
  useThemeStore,
  THEME_ORDER,
  THEME_META,
} from "../../stores/theme-store";
import type {
  AuthScheme,
  Profile,
  ProfilePreset,
  Protocol,
  TaskRoute,
} from "../../types/ai-types";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { listPresets } from "../../lib/ai-api";
import { Dropdown, type DropdownOption } from "../../components/Dropdown";

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
  const t = useT();

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
  const t = useT();
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
  const t = useT();
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
  const t = useT();
  const config = useAiStore((s) => s.config);
  const initialize = useAiStore((s) => s.initialize);
  const toggleGlobal = useAiStore((s) => s.toggleGlobal);
  const updateRoute = useAiStore((s) => s.updateRoute);
  const importFromClaudeCode = useAiStore((s) => s.importFromClaudeCode);

  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!config) getProjectRoot().then((root) => initialize(root));
  }, [config, initialize]);
  useEffect(() => {
    listPresets().then(setPresets).catch(() => {});
  }, []);

  if (!config) return <div className="text-text-muted text-xs">{t("common.loading")}</div>;

  const handleImport = async () => {
    try {
      const result = await importFromClaudeCode();
      const lines = [
        result.imported.length > 0
          ? t("settings.ai.importedCount", { n: result.imported.length })
          : t("settings.ai.importedNone"),
        ...result.notes,
      ];
      setImportNotice(lines.join("\n"));
    } catch (e: any) {
      setImportNotice(t("settings.ai.importFailed", { error: e?.message ?? String(e) }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle>{t("settings.tab.ai")}</SectionTitle>

      <div className="glass-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">
              {t("settings.ai.globalToggle")}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {t("settings.ai.globalToggleDesc")}
            </div>
          </div>
          <button onClick={() => toggleGlobal(!config.globalEnabled)}>
            {config.globalEnabled ? (
              <ToggleRight size={28} className="text-accent" />
            ) : (
              <ToggleLeft size={28} className="text-text-muted" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            {t("settings.ai.profilesHeader")} · {config.profiles.length}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent"
              title={t("settings.ai.importFromClaudeTip")}
            >
              <Download size={10} />
              {t("settings.ai.importFromClaude")}
            </button>
            <button
              onClick={() => setShowPresetPicker(true)}
              className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
            >
              <Plus size={10} />
              {t("settings.ai.newProfile")}
            </button>
          </div>
        </div>
        {importNotice && (
          <div className="mb-3 px-3 py-2 rounded bg-info/10 border border-info/30 text-[10px] text-info whitespace-pre-line flex items-start gap-2">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            <span className="flex-1">{importNotice}</span>
            <button onClick={() => setImportNotice(null)}>
              <X size={11} />
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {config.profiles.map((p) => (
            <ProfileRow key={p.id} profile={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      </div>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-3 block">
          {t("settings.ai.taskRouting")}
        </label>
        <RouteBulkApply
          routes={config.routes}
          profiles={config.profiles}
          onApply={async (profileId, model) => {
            // Update every existing route to point at the same profile+model.
            for (const r of config.routes) {
              await updateRoute({ ...r, profileId, model });
            }
          }}
        />
        <div className="flex flex-col gap-1.5">
          {config.routes.map((route) => (
            <RouteRow
              key={route.taskId}
              route={route}
              profiles={config.profiles}
              onChange={updateRoute}
            />
          ))}
        </div>
      </div>

      <div className="glass-panel p-4">
        <label className="text-[10px] uppercase tracking-wider text-text-muted mb-1 block">
          {t("settings.ai.usage")}
        </label>
        <div className="text-xs text-text-muted">
          {t("settings.ai.currentMonth")}: ${config.currentMonthUsageUsd.toFixed(4)}
          {config.monthlyBudgetUsd != null && (
            <span> / ${config.monthlyBudgetUsd.toFixed(2)}</span>
          )}
        </div>
      </div>

      {showPresetPicker && (
        <PresetPickerDialog
          presets={presets}
          onClose={() => setShowPresetPicker(false)}
          onPick={(preset) => {
            setShowPresetPicker(false);
            // Convert preset → blank Profile draft.
            setEditing({
              id: "",
              name: preset.name,
              protocol: preset.protocol,
              baseUrl: preset.baseUrl,
              endpointPath: preset.endpointPath,
              authScheme: preset.authScheme,
              apiKeySet: false,
              enabled: true,
              models: [...preset.suggestedModels],
              extraHeaders: {},
              builtin: false,
            });
          }}
        />
      )}

      {editing && (
        <ProfileEditorDialog
          profile={editing}
          isNew={editing.id === ""}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile row
// ---------------------------------------------------------------------------

function ProfileRow({
  profile,
  onEdit,
}: {
  profile: Profile;
  onEdit: () => void;
}) {
  const t = useT();
  const updateProfile = useAiStore((s) => s.updateProfile);
  const deleteProfile = useAiStore((s) => s.deleteProfile);
  const cloneProfile = useAiStore((s) => s.cloneProfile);
  const checkProfileHealth = useAiStore((s) => s.checkProfileHealth);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const protocolLabel = useMemo(() => protocolDisplay(profile.protocol, t), [profile.protocol, t]);

  const handleToggle = async () => {
    await updateProfile({ ...profile, enabled: !profile.enabled });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await checkProfileHealth(profile.id);
      setTestResult({ ok: r.ok, error: r.error ?? undefined });
    } catch (e: any) {
      setTestResult({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleDelete = async () => {
    if (profile.builtin) return;
    if (!confirm(t("settings.ai.confirmDelete", { name: profile.name }))) return;
    await deleteProfile(profile.id);
  };

  const handleClone = async () => {
    await cloneProfile(profile.id);
  };

  return (
    <div className="p-2.5 rounded-lg bg-white/3 border border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={handleToggle}
            className={`w-2 h-2 rounded-full shrink-0 ${
              profile.enabled ? "bg-success" : "bg-text-muted"
            }`}
            title={profile.enabled ? t("settings.ai.toggleEnabled") : t("settings.ai.toggleDisabled")}
          />
          <span className="text-xs font-medium text-text-primary truncate">{profile.name}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted">
            {protocolLabel}
          </span>
          {profile.builtin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-info/15 text-info">{t("settings.ai.builtin")}</span>
          )}
          {profile.apiKeySet && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/20 text-success">
              {t("settings.ai.keySet")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn title={t("settings.ai.testConnection")} onClick={handleTest} disabled={testing}>
            <Zap size={11} className={testing ? "text-text-muted animate-pulse" : "text-accent"} />
          </IconBtn>
          <IconBtn title={t("settings.ai.editProfile")} onClick={onEdit}>
            <Edit3 size={11} />
          </IconBtn>
          <IconBtn title={t("settings.ai.cloneProfile")} onClick={handleClone}>
            <CopyIcon size={11} />
          </IconBtn>
          {!profile.builtin && (
            <IconBtn title={t("settings.ai.deleteProfile")} onClick={handleDelete}>
              <Trash2 size={11} className="text-error" />
            </IconBtn>
          )}
        </div>
      </div>
      <div className="text-[10px] text-text-muted mt-1 truncate">{profile.baseUrl}</div>
      {testResult && (
        <div
          className={`mt-2 text-[10px] px-2 py-1 rounded ${
            testResult.ok
              ? "bg-success/10 text-success"
              : "bg-error/10 text-error"
          }`}
        >
          {testResult.ok ? t("settings.ai.testOk") : t("settings.ai.editor.testFailed", { error: testResult.error ?? "failed" })}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1 rounded hover:bg-white/5 text-text-muted hover:text-text-secondary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function protocolDisplay(p: Protocol, t: (key: string) => string): string {
  switch (p) {
    case "anthropic":
      return t("settings.ai.protocol.anthropic");
    case "openai-compatible":
      return t("settings.ai.protocol.openai");
    case "ollama":
      return t("settings.ai.protocol.ollama");
  }
}

// ---------------------------------------------------------------------------
// Route row (per-task profile + model dropdowns)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bulk-apply: pick one profile+model and re-route every task to it.
// ---------------------------------------------------------------------------

function RouteBulkApply({
  routes,
  profiles,
  onApply,
}: {
  routes: TaskRoute[];
  profiles: Profile[];
  onApply: (profileId: string, model: string) => Promise<void>;
}) {
  const t = useT();
  const [profileId, setProfileId] = useState("");
  const [model, setModel] = useState("");
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedProfile = profiles.find((p) => p.id === profileId);
  const modelOptions = selectedProfile?.models ?? [];

  useEffect(() => {
    // Default the model to the first one of the picked profile.
    if (selectedProfile && modelOptions.length > 0) {
      if (!model || !modelOptions.includes(model)) {
        setModel(modelOptions[0]);
      }
    }
  }, [profileId, modelOptions.join(",")]);

  const profileOptions: DropdownOption[] = profiles.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.enabled
      ? undefined
      : !p.apiKeySet
        ? t("settings.ai.needsKey")
        : t("settings.ai.toggleDisabled"),
    marker: p.enabled ? undefined : ("muted" as const),
  }));

  const canApply = !!profileId && !!model && !applying;

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    setStatus(null);
    try {
      await onApply(profileId, model);
      setStatus(t("settings.ai.bulkApplied", { count: String(routes.length) }));
      setTimeout(() => setStatus(null), 3000);
    } catch (e: any) {
      setStatus(`✗ ${e?.message ?? String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mb-3 pb-3 border-b border-white/5 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-text-muted">
        {t("settings.ai.bulkApplyLabel")}
      </span>
      <Dropdown
        value={profileId}
        options={profileOptions}
        onChange={setProfileId}
        placeholder={t("settings.ai.bulkPickProfile")}
        className="text-[11px] px-2 py-1 min-w-[140px]"
      />
      <Dropdown
        value={model}
        options={modelOptions.map((m) => ({ value: m, label: m }))}
        onChange={setModel}
        placeholder={
          !profileId
            ? t("settings.ai.bulkPickProfileFirst")
            : modelOptions.length === 0
              ? t("settings.ai.modelNoneAvailable")
              : t("settings.ai.modelPlaceholder")
        }
        disabled={!profileId || modelOptions.length === 0}
        className="text-[11px] px-2 py-1 w-44"
      />
      <button
        onClick={handleApply}
        disabled={!canApply}
        className="glass-button-primary px-3 py-1 text-[11px] rounded-lg font-medium disabled:opacity-40"
      >
        {applying
          ? t("settings.ai.bulkApplying")
          : t("settings.ai.bulkApplyButton", { count: String(routes.length) })}
      </button>
      {status && (
        <span className="text-[11px] text-success ml-1">{status}</span>
      )}
    </div>
  );
}

function RouteRow({
  route,
  profiles,
  onChange,
}: {
  route: TaskRoute;
  profiles: Profile[];
  onChange: (route: TaskRoute) => void;
}) {
  const t = useT();
  const target = profiles.find((p) => p.id === route.profileId);
  const targetMissing = !target;
  const modelOptions = target?.models ?? [];

  const dropdownOptions: DropdownOption[] = [
    ...(targetMissing
      ? [
          {
            value: route.profileId,
            label: `${t("settings.ai.profileDeleted")} ${route.profileId}`,
            marker: "error" as const,
          },
        ]
      : []),
    // Show all profiles so the user can re-route even if they only have
    // disabled ones. Profiles without an API key (the most common reason
    // for being disabled) get a clearer hint.
    ...profiles.map((p) => {
      const hint = p.enabled
        ? undefined
        : !p.apiKeySet
          ? t("settings.ai.needsKey")
          : t("settings.ai.toggleDisabled");
      return {
        value: p.id,
        label: p.name,
        hint,
        marker: p.enabled ? undefined : ("muted" as const),
      };
    }),
  ];

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-text-primary">{t(`task.${route.taskId}`)}</span>
      <div className="flex items-center gap-2">
        <Dropdown
          value={route.profileId}
          options={dropdownOptions}
          onChange={(v) => onChange({ ...route, profileId: v })}
          className={`text-[11px] px-2 py-1 min-w-[140px] ${
            targetMissing ? "border-error" : ""
          }`}
        />
        <Dropdown
          value={route.model}
          options={[
            // Include the currently-set model even if it's not in the
            // profile's known list (user may have typed a custom one earlier).
            ...(route.model && !modelOptions.includes(route.model)
              ? [{ value: route.model, label: route.model, marker: "muted" as const, hint: t("settings.ai.modelCustom") }]
              : []),
            ...modelOptions.map((m) => ({ value: m, label: m })),
          ]}
          onChange={(v) => onChange({ ...route, model: v })}
          placeholder={modelOptions.length === 0 ? t("settings.ai.modelNoneAvailable") : t("settings.ai.modelPlaceholder")}
          disabled={modelOptions.length === 0 && !route.model}
          className="text-[11px] px-2 py-1 w-44"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset picker dialog
// ---------------------------------------------------------------------------

function PresetPickerDialog({
  presets,
  onClose,
  onPick,
}: {
  presets: ProfilePreset[];
  onClose: () => void;
  onPick: (preset: ProfilePreset) => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="glass-thick rounded-2xl w-[560px] max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-sm font-medium text-text-primary">{t("settings.ai.presets.title")}</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onPick(preset)}
              className="w-full flex items-start gap-3 px-3 py-2.5 rounded text-left hover:bg-white/5"
            >
              <Cpu size={14} className="text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-text-primary">{preset.name}</div>
                <div className="text-[10px] text-text-muted truncate">
                  {protocolDisplay(preset.protocol, t)} · {preset.baseUrl || t("settings.ai.presets.needsFill")}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile editor dialog (new + edit)
// ---------------------------------------------------------------------------

function ProfileEditorDialog({
  profile,
  isNew,
  onClose,
}: {
  profile: Profile;
  isNew: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Profile>(profile);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [extraHeadersText, setExtraHeadersText] = useState(
    Object.entries(profile.extraHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  );
  const [modelsText, setModelsText] = useState(profile.models.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const createProfile = useAiStore((s) => s.createProfile);
  const updateProfile = useAiStore((s) => s.updateProfile);
  const setProfileApiKey = useAiStore((s) => s.setProfileApiKey);
  const checkDraftHealth = useAiStore((s) => s.checkDraftHealth);

  const composedDraft = useMemo<Profile>(() => {
    const headers: Record<string, string> = {};
    for (const line of extraHeadersText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx < 0) continue;
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      if (k) headers[k] = v;
    }
    const models = modelsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { ...draft, extraHeaders: headers, models };
  }, [draft, extraHeadersText, modelsText]);

  const requiresKey = draft.authScheme.kind !== "none";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let saved: Profile;
      if (isNew) {
        saved = await createProfile(composedDraft);
      } else {
        saved = await updateProfile(composedDraft);
      }
      if (apiKeyInput.trim()) {
        await setProfileApiKey(saved.id, apiKeyInput.trim());
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await checkDraftHealth(
        composedDraft,
        apiKeyInput.trim() ? apiKeyInput.trim() : null,
      );
      setTestResult({ ok: r.ok, error: r.error ?? undefined });
    } catch (e: any) {
      setTestResult({ ok: false, error: String(e?.message ?? e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="glass-thick rounded-2xl w-[640px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-sm font-medium text-text-primary">
            {isNew ? t("settings.ai.editor.titleNew") : t("settings.ai.editor.titleEdit", { name: profile.name })}
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          <Field label={t("settings.ai.editor.name")}>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="text-xs px-2 py-1 rounded w-full"
            />
          </Field>

          <Field label={t("settings.ai.editor.protocol")}>
            <select
              value={draft.protocol}
              onChange={(e) =>
                setDraft({ ...draft, protocol: e.target.value as Protocol })
              }
              className="text-xs px-2 py-1 rounded w-full"
              disabled={profile.builtin}
            >
              <option value="anthropic">{t("settings.ai.protocol.anthropicOpt")}</option>
              <option value="openai-compatible">{t("settings.ai.protocol.openaiOpt")}</option>
              <option value="ollama">{t("settings.ai.protocol.ollamaOpt")}</option>
            </select>
          </Field>

          <Field label={t("settings.ai.editor.baseUrl")}>
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder={t("settings.ai.editor.urlPlaceholder")}
              className="text-xs px-2 py-1 rounded w-full font-mono"
            />
          </Field>

          <Field label={t("settings.ai.editor.endpointPath")}>
            <input
              value={draft.endpointPath}
              onChange={(e) => setDraft({ ...draft, endpointPath: e.target.value })}
              placeholder={defaultEndpointPath(draft.protocol)}
              className="text-xs px-2 py-1 rounded w-full font-mono"
            />
          </Field>

          <Field label={t("settings.ai.editor.authScheme")}>
            <AuthSchemeEditor
              value={draft.authScheme}
              onChange={(s) => setDraft({ ...draft, authScheme: s })}
            />
          </Field>

          {requiresKey && (
            <Field label={profile.apiKeySet ? t("settings.ai.editor.apiKeyKeep") : t("settings.ai.editor.apiKey")}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={profile.apiKeySet ? t("settings.ai.editor.apiKeyExisting") : "sk-..."}
                className="text-xs px-2 py-1 rounded w-full font-mono"
              />
            </Field>
          )}

          <Field label={t("settings.ai.editor.models")}>
            <textarea
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              rows={4}
              className="text-xs px-2 py-1 rounded w-full font-mono resize-none"
              placeholder={t("settings.ai.editor.modelsPlaceholder")}
            />
          </Field>

          <Field label={t("settings.ai.editor.extraHeaders")}>
            <textarea
              value={extraHeadersText}
              onChange={(e) => setExtraHeadersText(e.target.value)}
              rows={3}
              className="text-xs px-2 py-1 rounded w-full font-mono resize-none"
              placeholder={t("settings.ai.editor.headersPlaceholder")}
            />
          </Field>

          {error && (
            <div className="text-[10px] text-error px-2 py-1 rounded bg-error/10">{error}</div>
          )}
          {testResult && (
            <div
              className={`text-[10px] px-2 py-1 rounded ${
                testResult.ok ? "bg-success/10 text-success" : "bg-error/10 text-error"
              }`}
            >
              {testResult.ok ? t("settings.ai.testOk") : t("settings.ai.editor.testFailed", { error: testResult.error ?? "failed" })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5">
          <button
            onClick={handleTest}
            disabled={testing}
            className="glass-button px-4 py-2 text-sm rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
          >
            <Zap size={14} />
            {testing ? t("settings.ai.testing") : t("settings.ai.testConnection")}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="glass-button px-4 py-2 text-sm rounded-lg transition-colors"
            >
              {t("settings.ai.editor.cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.name.trim() || !draft.baseUrl.trim()}
              className="glass-button-primary px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? t("settings.ai.editor.saving") : t("settings.ai.editor.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultEndpointPath(p: Protocol): string {
  switch (p) {
    case "anthropic":
      return "/v1/messages";
    case "openai-compatible":
      return "/v1/chat/completions";
    case "ollama":
      return "/api/chat";
  }
}

function AuthSchemeEditor({
  value,
  onChange,
}: {
  value: AuthScheme;
  onChange: (s: AuthScheme) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <select
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as AuthScheme["kind"];
          if (kind === "custom-header") onChange({ kind, name: "X-API-Key" });
          else if (kind === "anthropic-key") onChange({ kind: "anthropic-key" });
          else if (kind === "bearer") onChange({ kind: "bearer" });
          else onChange({ kind: "none" });
        }}
        className="text-xs px-2 py-1 rounded"
      >
        <option value="anthropic-key">{t("settings.ai.auth.anthropic")}</option>
        <option value="bearer">{t("settings.ai.auth.bearer")}</option>
        <option value="custom-header">{t("settings.ai.auth.custom")}</option>
        <option value="none">{t("settings.ai.auth.none")}</option>
      </select>
      {value.kind === "custom-header" && (
        <input
          value={value.name}
          onChange={(e) => onChange({ kind: "custom-header", name: e.target.value })}
          placeholder={t("settings.ai.editor.headerNamePlaceholder")}
          className="text-xs px-2 py-1 rounded flex-1 font-mono"
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-text-muted">{label}</label>
      {children}
    </div>
  );
}

function EditorTab() {
  const t = useT();
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
  const t = useT();
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
