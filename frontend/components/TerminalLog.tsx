"use client";

import { useEffect, useRef } from "react";

interface Props {
  logs: string[];
}

const LOG_COLOR: Record<string, string> = {
  HEDGE:    "#00d4ff",
  COMPOUND: "#00ff88",
  WARN:     "#ff9500",
  ERROR:    "#ff3366",
  KILL:     "#ff3366",
};

function colorLine(line: string): { text: string; color: string } {
  const tagMatch = line.match(/\[(HEDGE|COMPOUND|WARN|ERROR|KILL[_A-Z]*)\]/);
  if (tagMatch) {
    return { text: line, color: LOG_COLOR[tagMatch[1]] ?? "#00d4ff" };
  }
  if (line.includes("IL:") || line.includes("Price:")) {
    return { text: line, color: "rgba(255,255,255,0.6)" };
  }
  return { text: line, color: "rgba(255,255,255,0.35)" };
}

export function TerminalLog({ logs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div
      ref={containerRef}
      style={{
        background: "rgba(0,0,0,0.6)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        padding: "12px 14px",
        height: 480px,
        overflowY: "auto",
        fontFamily: "var(--font-hud), 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 2,
      }}
    >
      {logs.length === 0 && (
        <span style={{ color: "var(--text-faint)" }}>
          Waiting for agent output...
        </span>
      )}
      {logs.map((line, i) => {
        const { text, color } = colorLine(line);
        return (
          <div key={i} style={{ color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {text}
          </div>
        );
      })}
    </div>
  );
}
