import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { subscribeOutput } from "../../stores/terminal-store";
import {
  writeSession,
  resizeSession,
  recordCommand,
} from "../../lib/terminal-api";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useEditorStore } from "../../stores/editor-store";
import { HistorySearchOverlay } from "./HistorySearchOverlay";

interface Props {
  sessionId: string;
  cwd?: string;
  visible: boolean;
}

export function XtermInstance({ sessionId, cwd, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const themeVariant = useThemeStore((s) => s.variant);
  const appearance = useSettingsStore((s) => s.appearance);
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const [searchOpen, setSearchOpen] = useState(false);

  // Track what the user has typed on the current line so we can record it on
  // Enter. Best-effort; doesn't try to shadow the shell's own line editing.
  const inputBufferRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: appearance.fontFamily,
      fontSize: appearance.fontSize,
      lineHeight: 1.3,
      cursorBlink: true,
      allowProposedApi: true,
      theme: getTheme(themeVariant, appearance.terminalFontColor, appearance.terminalFontColorLight),
      scrollback: 10000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    // Initial fit after mount
    requestAnimationFrame(() => {
      try {
        fit.fit();
        resizeSession(sessionId, term.cols, term.rows);
      } catch {
        // ignore
      }
    });

    // User input → PTY, and track input buffer for history.
    term.onData((data) => {
      // Cmd+R / Ctrl+R is 0x12 in raw keycodes; intercept via attachCustomKeyEventHandler instead.
      writeSession(sessionId, data);
      updateInputBuffer(inputBufferRef, data, () => {
        const cmd = inputBufferRef.current.trim();
        inputBufferRef.current = "";
        if (cmd && projectRoot) {
          void recordCommand(projectRoot, cmd, cwd ?? projectRoot).catch(() => {});
        }
      });
    });

    // Cmd+R / Ctrl+R opens the fuzzy history search overlay.
    term.attachCustomKeyEventHandler((ev) => {
      if (
        (ev.metaKey || ev.ctrlKey) &&
        !ev.altKey &&
        !ev.shiftKey &&
        ev.key.toLowerCase() === "r" &&
        ev.type === "keydown"
      ) {
        ev.preventDefault();
        setSearchOpen(true);
        return false;
      }
      return true;
    });

    // PTY output → xterm
    const unsubscribe = subscribeOutput(sessionId, (data) => {
      term.write(data);
    });

    // Resize on container changes
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        resizeSession(sessionId, term.cols, term.rows);
      } catch {
        // ignore
      }
    });
    ro.observe(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;

    return () => {
      unsubscribe();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId, projectRoot, cwd]);

  // Update theme reactively
  useEffect(() => {
    termRef.current?.options &&
      (termRef.current.options.theme = getTheme(themeVariant, appearance.terminalFontColor, appearance.terminalFontColorLight));
  }, [themeVariant]);

  // Refit when becoming visible (tab switch)
  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          if (termRef.current) {
            resizeSession(sessionId, termRef.current.cols, termRef.current.rows);
          }
        } catch {
          // ignore
        }
      });
    }
  }, [visible, sessionId]);

  const handlePickHistory = (command: string) => {
    setSearchOpen(false);
    // Type the command into the terminal; do NOT auto-press Enter. Let the
    // user review and run it themselves.
    writeSession(sessionId, command);
    inputBufferRef.current = command;
    termRef.current?.focus();
  };

  return (
    <div
      className="w-full h-full relative"
      style={{ display: visible ? "block" : "none" }}
    >
      <div ref={containerRef} className="w-full h-full" />
      {searchOpen && projectRoot && (
        <HistorySearchOverlay
          projectRoot={projectRoot}
          onPick={handlePickHistory}
          onClose={() => {
            setSearchOpen(false);
            termRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/**
 * Track what the user typed on the current line. Not a perfect model of shell
 * editing (no left-arrow, no Ctrl+U, no bracketed paste) — just good enough to
 * capture "what they pressed Enter on".
 *
 * - Regular char → append.
 * - `\r` or `\n` → fire `onSubmit` and reset.
 * - `\x7f` (DEL / backspace) → pop last char.
 * - `\x03` (Ctrl+C) → reset without recording.
 */
function updateInputBuffer(
  bufRef: { current: string },
  data: string,
  onSubmit: () => void,
) {
  for (const ch of data) {
    const code = ch.charCodeAt(0);
    if (code === 0x0d || code === 0x0a) {
      onSubmit();
    } else if (code === 0x7f || code === 0x08) {
      bufRef.current = bufRef.current.slice(0, -1);
    } else if (code === 0x03) {
      bufRef.current = "";
    } else if (code === 0x1b) {
      // Escape sequence (arrow keys, etc) — best-effort ignore the whole run.
      // We can't tell how long it is here, so we just drop the ESC itself and
      // hope the shell swallows the rest without visible effect on our buffer.
      // In practice users rarely use arrow-key editing before pressing Enter;
      // at worst, the recorded command misses an edit.
      continue;
    } else if (code >= 0x20) {
      bufRef.current += ch;
    }
  }
}

function getTheme(variant: string, fgDark: string, fgLight: string) {
  const isLight = variant === "light" || variant === "blossom" || variant === "mist";
  const fg = isLight ? fgLight : fgDark;
  return {
    background: "rgba(0, 0, 0, 0)",
    foreground: fg,
    cursor: fg,
    selectionBackground: fg + "4d", // ~30% alpha
  };
}
