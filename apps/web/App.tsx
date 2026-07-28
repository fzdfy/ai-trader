import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import Dashboard from "./components/Dashboard";

const TABS = ["自选", "行情", "K线", "信号", "回测"] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("自选");

  return (
    <VStack gap={0} style={{ minHeight: "100vh" }}>
      <HStack
        align="center"
        justify="between"
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--ax-color-border)",
        }}
      >
        <VStack gap={1}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI Trader</h1>
          <span style={{ fontSize: 13, color: "var(--ax-color-text-secondary)" }}>
            智能 A 股分析与策略平台
          </span>
        </VStack>
      </HStack>

      <HStack
        gap={0}
        style={{
          padding: "0 24px",
          borderBottom: "1px solid var(--ax-color-border)",
        }}
      >
        {TABS.map((tab) => (
          <Button
            key={tab}
            label={tab}
            variant={activeTab === tab ? "primary" : "secondary"}
            onPress={() => setActiveTab(tab)}
            style={{
              borderRadius: 0,
              borderBottom:
                activeTab === tab
                  ? "2px solid var(--ax-color-accent)"
                  : "2px solid transparent",
              marginBottom: -1,
            }}
          />
        ))}
      </HStack>

      <main style={{ flex: 1, padding: 24 }}>
        <Dashboard activeTab={activeTab} />
      </main>
    </VStack>
  );
}
