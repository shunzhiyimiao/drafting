import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { subscribeOutput } from "../../stores/terminal-store";
import { writeSession, resizeSession } from "../../lib/terminal-api";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";

interface Props {
  sessionId: string;
  visible: boolean;
}

export function XtermInstance({ sessionId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const themeVariant = useThemeStore((s) => s.variant);
  const appearance = useSettingsStore((s) => s.appearance);

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

    // User input → PTY
    term.onData((data) => {
      writeSession(sessionId, data);
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
  }, [sessionId]);

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

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: visible ? "block" : "none" }}
    />
  );
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
