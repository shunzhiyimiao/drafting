import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { RightPanel } from "./components/RightPanel";
import { BottomPanel } from "./components/BottomPanel";
import { CommandPalette } from "./components/CommandPalette";
import { SearchDialog } from "./components/SearchDialog";
import { useLayoutStore } from "./stores/layout-store";
import { useNavigationStore, type ViewId } from "./stores/navigation-store";

function TooSmallScreen() {
  return (
    <div className="flex items-center justify-center h-screen p-8 text-center">
      <div className="glass-panel p-8">
        <p className="text-lg font-medium text-text-primary mb-2">
          Window too small
        </p>
        <p className="text-sm text-text-muted">
          Drafting requires a minimum window width of 768px.
        </p>
      </div>
    </div>
  );
}

function App() {
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const zenMode = useLayoutStore((s) => s.zenMode);
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
  const setActiveView = useNavigationStore((s) => s.setActiveView);

  const [windowTooSmall, setWindowTooSmall] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chordBuffer, setChordBuffer] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setWindowTooSmall(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+Shift+P: command palette
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Cmd+Shift+F: global search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Cmd+K starts a chord sequence
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey) {
        e.preventDefault();
        setChordBuffer("cmd-k");
        setTimeout(() => setChordBuffer(null), 2000);
        return;
      }

      // Chord: Cmd+K Z → Zen mode
      if (chordBuffer === "cmd-k" && e.key.toLowerCase() === "z") {
        e.preventDefault();
        toggleZenMode();
        setChordBuffer(null);
        return;
      }

      // "g" starts navigation chord
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.key === "g") {
        // Only activate if not in an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement).isContentEditable) {
          setChordBuffer("g");
          setTimeout(() => setChordBuffer(null), 2000);
          return;
        }
      }

      // Navigation chords
      if (chordBuffer === "g") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
          setChordBuffer(null);
          return;
        }
        const targets: Record<string, ViewId> = {
          d: "headquarters",
          b: "blueprint",
          p: "patchboard",
          e: "editor",
          a: "atlas",
          g: "git",
          t: "terminal",
        };
        const target = targets[e.key];
        if (target) {
          e.preventDefault();
          setActiveView(target);
          setChordBuffer(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chordBuffer, toggleZenMode, setActiveView]);

  if (windowTooSmall) {
    return <TooSmallScreen />;
  }

  return (
    <div className="flex h-screen">
      {!sidebarCollapsed && !zenMode && <Sidebar />}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex flex-1 min-h-0">
          <MainContent />
          {!zenMode && <RightPanel />}
        </div>
        {!zenMode && <BottomPanel />}
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
      {chordBuffer && (
        <div className="glass-thick fixed bottom-4 right-4 rounded-lg px-3 py-1.5 text-xs text-text-secondary">
          {chordBuffer === "cmd-k" ? "Cmd+K ..." : "g ..."}
        </div>
      )}
    </div>
  );
}

export default App;
