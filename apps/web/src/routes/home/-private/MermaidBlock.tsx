import { useEffect, useState } from "react";
import { Text } from "@astryxdesign/core/Text";

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidPromise;
}

function isDarkTheme(): boolean {
  const explicit = globalThis.document.documentElement.dataset.theme;
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
}

let seq = 0;

export function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    (async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: isDarkTheme() ? "dark" : "neutral",
        });
        seq += 1;
        const { svg: rendered } = await mermaid.render(`knowledge-mermaid-${seq}`, chart);
        if (!cancelled) setSvg(rendered);
      } catch (error_) {
        if (!cancelled) setError(error_ instanceof Error ? error_.message : String(error_));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div
        style={{
          padding: "var(--spacing-3)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-inner)",
        }}
      >
        <Text size="sm" type="supporting">
          图表渲染失败：{error}
        </Text>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        overflowX: "auto",
        padding: "var(--spacing-3)",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
