import { Text } from "@astryxdesign/core/Text";
import type { MainlineItem } from "../../hooks/useReviews";

interface MainlineCardsProps {
  data: MainlineItem[];
}

/**
 * 主线卡片 — 复盘「主线」模块的可视化。
 * 主线是 agent 基于资金流与涨幅判断出的核心板块（1~3 个），
 * 用大号序号 + 板块名 + 判断理由的卡片呈现，强调视觉层次。
 */
export function MainlineCards({ data }: MainlineCardsProps) {
  if (data.length === 0) {
    return <Text type="supporting">暂无主线判断</Text>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(data.length, 3)}, 1fr)`,
        gap: "var(--spacing-4)",
        width: "100%",
      }}
    >
      {data.map((m, i) => (
        <div
          key={`${m.boardName}-${i}`}
          style={{
            background: "var(--color-background-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "var(--spacing-5)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 4,
              height: "100%",
              background: "var(--color-accent)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
            <Text
              style={{
                color: "var(--color-accent)",
                fontWeight: 700,
                fontSize: 32,
                lineHeight: 1,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text style={{ fontWeight: 700, fontSize: 20 }}>{m.boardName}</Text>
            <Text type="supporting" size="sm" style={{ lineHeight: 1.6 }}>
              {m.reason}
            </Text>
          </div>
        </div>
      ))}
    </div>
  );
}
