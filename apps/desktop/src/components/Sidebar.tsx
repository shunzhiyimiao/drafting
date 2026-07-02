import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Home,
  FileText,
  PenTool,
  CircuitBoard,
  Map,
  Code,
  GitBranch,
  Terminal,
  Settings,
  Palette,
  Check,
  FolderOpen,
} from "lucide-react";
import {
  useNavigationStore,
  type ViewId,
} from "../stores/navigation-store";
import {
  useThemeStore,
  THEME_ORDER,
  THEME_META,
  type ThemeVariant,
} from "../stores/theme-store";
import { useT } from "../lib/i18n";
import {
  getProjectRoot,
  getRecentWorkspaces,
  setWorkspace,
} from "../lib/app-bootstrap";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const topItems: { id: ViewId; icon: typeof Home; labelKey: string }[] = [
  { id: "headquarters", icon: Home, labelKey: "nav.headquarters" },
  { id: "blueprint", icon: FileText, labelKey: "nav.blueprint" },
  { id: "sketch", icon: PenTool, labelKey: "nav.sketch" },
  { id: "patchboard", icon: CircuitBoard, labelKey: "nav.patchboard" },
  { id: "atlas", icon: Map, labelKey: "nav.atlas" },
  { id: "editor", icon: Code, labelKey: "nav.editor" },
  { id: "git", icon: GitBranch, labelKey: "nav.git" },
  { id: "terminal", icon: Terminal, labelKey: "nav.terminal" },
];

interface SidebarButtonProps {
  id: ViewId;
  Icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
}

function SidebarButton({ Icon, label, active, onClick }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
        active ? "text-accent" : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {active && (
        <>
          <span
            className="absolute inset-0 rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.25), rgba(var(--color-accent-rgb), 0.08))",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 20px rgba(var(--color-accent-rgb), 0.25)",
              border: "1px solid rgba(var(--color-accent-rgb), 0.35)",
            }}
          />
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />
        </>
      )}
      {!active && (
        <span className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 bg-white/5 transition-opacity" />
      )}
      <Icon size={18} className="relative z-10" />
    </button>
  );
}

function ThemePicker() {
  const t = useT();
  const variant = useThemeStore((s) => s.variant);
  const setVariant = useThemeStore((s) => s.setVariant);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position the popover to the right of the button. Computed against
  // viewport because the popover is rendered in a portal on <body>
  // to escape the sidebar's backdrop-filter containing block.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      setPos({
        left: rect.right + 8,
        bottom: window.innerHeight - rect.bottom,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popoverRef}
            className="glass-thick rounded-2xl p-2 flex flex-col gap-0.5 min-w-[240px]"
            style={{
              position: "fixed",
              left: pos.left,
              bottom: pos.bottom,
              zIndex: 9999,
            }}
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted">
              {t("sidebar.theme")}
            </div>
            {THEME_ORDER.map((id) => (
              <ThemeOption
                key={id}
                id={id}
                active={variant === id}
                onSelect={() => {
                  setVariant(id);
                  setOpen(false);
                }}
              />
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        title={t("sidebar.theme")}
        className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
          open ? "text-accent" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        <span className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 bg-white/5 transition-opacity" />
        <Palette size={18} className="relative z-10" />
      </button>
      {popover}
    </>
  );
}

function ThemeOption({
  id,
  active,
  onSelect,
}: {
  id: ThemeVariant;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = THEME_META[id];
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors ${
        active
          ? "bg-white/10 text-text-primary"
          : "text-text-secondary hover:bg-white/5"
      }`}
    >
      <SwatchPreview variant={id} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium">{meta.label}</div>
      </div>
      {active && <Check size={14} className="text-accent shrink-0" />}
    </button>
  );
}

/** Tiny gradient preview disc for each variant */
function SwatchPreview({ variant }: { variant: ThemeVariant }) {
  const backgrounds: Record<ThemeVariant, string> = {
    dark: "linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #0ea5e9 100%)",
    light: "linear-gradient(135deg, #ffc8dc, #bedcff, #c8f0dc, #e6c8ff)",
    soft: "linear-gradient(135deg, #b4c8e6, #dcbed2, #bedcd2, #c8b4dc)",
    blossom: "linear-gradient(135deg, #ffdee7, #ffc8dc, #ffebf0)",
    mist: "linear-gradient(135deg, #c5cef9, #b4c3f5, #d2dcfc)",
  };
  return (
    <span
      className="w-7 h-7 rounded-full shrink-0"
      style={{
        background: backgrounds[variant],
        border: "1px solid rgba(255, 255, 255, 0.2)",
        boxShadow:
          "inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 8px rgba(0, 0, 0, 0.15)",
      }}
    />
  );
}

export function Sidebar() {
  const t = useT();
  const { activeView, setActiveView } = useNavigationStore();

  return (
    <div className="glass-sidebar flex flex-col items-center w-14 py-3 shrink-0 gap-1">
      <div className="flex flex-col items-center gap-2 flex-1">
        {topItems.map(({ id, icon: Icon, labelKey }) => (
          <SidebarButton
            key={id}
            id={id}
            Icon={Icon}
            label={t(labelKey)}
            active={activeView === id}
            onClick={() => setActiveView(id)}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        <WorkspacePicker />
        <ThemePicker />
        <SidebarButton
          id="settings"
          Icon={Settings}
          label={t("nav.settings")}
          active={activeView === "settings"}
          onClick={() => setActiveView("settings")}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace picker (popover anchored to the sidebar button)
// ---------------------------------------------------------------------------

function WorkspacePicker() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [current, setCurrent] = useState<string>("");
  const [recent, setRecent] = useState<string[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getProjectRoot().then(setCurrent);
  }, []);

  useEffect(() => {
    if (!open) return;
    getRecentWorkspaces().then(setRecent);
    setPathInput("");
    setError(null);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setPos({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || popRef.current?.contains(tgt))
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) {
      setError(t("workspace.errorEmpty"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setWorkspace(trimmed); // triggers window.location.reload
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(false);
    }
  };

  const popover =
    open && pos
      ? createPortal(
          <div
            ref={popRef}
            className="glass-thick rounded-2xl p-2 flex flex-col gap-1 min-w-[340px] max-w-[480px]"
            style={{
              position: "fixed",
              left: pos.left,
              bottom: pos.bottom,
              zIndex: 9999,
            }}
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-muted">
              {t("workspace.title")}
            </div>
            <div className="px-3 py-1">
              <div className="text-[10px] text-text-muted">
                {t("workspace.current")}
              </div>
              <div className="text-xs text-text-primary truncate" title={current}>
                {current || "—"}
              </div>
            </div>

            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text-muted">
              {t("workspace.openOther")}
            </div>
            <div className="px-3 flex gap-2 items-center">
              <button
                onClick={async () => {
                  setError(null);
                  try {
                    const selected = await openDialog({
                      directory: true,
                      multiple: false,
                      defaultPath: current || undefined,
                      title: t("workspace.title"),
                    });
                    if (typeof selected === "string" && selected) {
                      await apply(selected);
                    }
                  } catch (e: any) {
                    setError(e?.message ?? String(e));
                  }
                }}
                disabled={busy}
                className="glass-button-primary px-3 py-2 text-xs rounded-lg font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <FolderOpen size={12} />
                {t("workspace.browseFolder")}
              </button>
              <span className="text-[10px] text-text-muted">
                {t("workspace.orPaste")}
              </span>
              <input
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder={t("workspace.pathPlaceholder")}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") apply(pathInput);
                }}
                className="flex-1 text-xs px-2 py-1.5 rounded font-mono min-w-[120px]"
              />
            </div>
            {error && (
              <p className="px-3 mt-1 text-[11px] text-error break-words">
                {error}
              </p>
            )}

            {recent.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-text-muted">
                  {t("workspace.recent")}
                </div>
                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                  {recent.map((p) => (
                    <button
                      key={p}
                      onClick={() => apply(p)}
                      disabled={busy}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-mono truncate hover:bg-white/5 ${
                        p === current
                          ? "text-text-primary bg-white/5"
                          : "text-text-secondary"
                      }`}
                      title={p}
                    >
                      {p === current && (
                        <Check size={10} className="inline mr-1.5 text-accent" />
                      )}
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={t("workspace.title")}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary transition-colors"
      >
        <span className="absolute inset-0 rounded-xl opacity-0 hover:opacity-100 bg-white/5 transition-opacity" />
        <FolderOpen size={18} className="relative z-10" />
      </button>
      {popover}
    </>
  );
}
