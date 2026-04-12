import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { subscribeOutput } from "../../stores/terminal-store";
import { writeSession, resizeSession } from "../../lib/terminal-api";
import { useThemeStore } from "../../stores/theme-store";

interface Props {
  sessionId: string;
  visible: boolean;
}

export function XtermInstance({ sessionId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const themeVariant = useThemeStore((s) => s.variant);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      allowProposedApi: true,
      theme: getTheme(themeVariant),
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
      (termRef.current.options.theme = getTheme(themeVariant));
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

function getTheme(variant: string) {
  if (variant === "light" || variant === "blossom" || variant === "mist") {
    return {
      background: "rgba(0, 0, 0, 0)",
      foreground: "#e87d2e",
      cursor: "#e87d2e",
      selectionBackground: "rgba(232, 125, 46, 0.3)",
    };
  }
  return {
    background: "rgba(0, 0, 0, 0)",
    foreground: "#f0a050",
    cursor: "#f0a050",
    selectionBackground: "rgba(240, 160, 80, 0.3)",
  };
}
