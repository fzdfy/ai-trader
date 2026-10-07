/**
 * 主题设置 — 预设色板（8 色）与显示模式（浅色 / 深色 / 跟随系统）选择。
 *
 * 选择即时生效并自动持久化（localStorage），下方提供实时预览。
 */
import { type ReactNode } from "react";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useAppTheme } from "../../../components/AppThemeProvider";
import { MODE_LABELS, THEME_PRESETS, type AppThemeMode } from "../../../lib/app-theme";

/** 显示模式图标 */
const MODE_ICONS: Record<AppThemeMode, ReactNode> = {
  light: <Sun size={15} />,
  dark: <Moon size={15} />,
  system: <Monitor size={15} />,
};

/** 预设色板圆形色块（选中时内嵌对勾） */
function AccentSwatch({ color, isSelected }: { color: string; isSelected: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: `radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 58%), ${color}`,
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
      }}
    >
      {isSelected && <Check size={16} color="#ffffff" strokeWidth={3} />}
    </span>
  );
}

/** 小标题 + 说明 */
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <VStack gap={1}>
      <Text weight="medium">{title}</Text>
      <Text size="sm" type="supporting">
        {description}
      </Text>
    </VStack>
  );
}

/** 主色阶梯（用于直观预览当前主色的深浅过渡） */
const SWATCH_STEPS = [15, 30, 45, 60, 80, 100];

export function ThemeSettings() {
  const { preset, mode, setPresetId, setMode } = useAppTheme();

  return (
    <VStack gap={6} style={{ maxWidth: 780 }}>
      {/* 配色主题 */}
      <VStack gap={3}>
        <SectionHeader
          title="配色主题"
          description="选择应用主色调，按钮、选中态、强调文字与图表强调色会同步变化。"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))",
            gap: "var(--spacing-3)",
          }}
        >
          {THEME_PRESETS.map((p) => {
            const isSelected = p.id === preset.id;
            return (
              <SelectableCard
                key={p.id}
                label={p.label}
                isSelected={isSelected}
                onChange={() => setPresetId(p.id)}
                padding={3}
              >
                <VStack gap={2} align="center">
                  <AccentSwatch color={p.accent} isSelected={isSelected} />
                  <Text size="sm" weight={isSelected ? "medium" : "normal"}>
                    {p.label}
                  </Text>
                </VStack>
              </SelectableCard>
            );
          })}
        </div>
      </VStack>

      {/* 显示模式 */}
      <VStack gap={3}>
        <SectionHeader
          title="显示模式"
          description="深色模式降低夜间看盘的视觉疲劳；跟随系统会随操作系统外观自动切换。"
        />
        <SegmentedControl
          value={mode}
          onChange={(value) => setMode(value as AppThemeMode)}
          label="显示模式"
        >
          {(Object.keys(MODE_LABELS) as AppThemeMode[]).map((m) => (
            <SegmentedControlItem key={m} value={m} label={MODE_LABELS[m]} icon={MODE_ICONS[m]} />
          ))}
        </SegmentedControl>
      </VStack>

      {/* 效果预览 */}
      <VStack gap={3}>
        <SectionHeader title="效果预览" description="当前主题在常用控件上的呈现效果。" />
        <Card variant="default" padding={4}>
          <VStack gap={4}>
            <HStack gap={3} align="center" style={{ flexWrap: "wrap" }}>
              <Button label="主按钮" variant="primary" size="sm" />
              <Button label="次按钮" variant="secondary" size="sm" />
              <Button label="幽灵按钮" variant="ghost" size="sm" />
              <HStack gap={2} align="center">
                <StatusDot variant="accent" label="强调" />
                <Text color="accent" weight="medium">
                  强调文字
                </Text>
              </HStack>
            </HStack>

            <VStack gap={2}>
              <Text size="sm" type="supporting">
                主色阶梯
              </Text>
              <HStack gap={1}>
                {SWATCH_STEPS.map((pct) => (
                  <span
                    key={pct}
                    style={{
                      flex: 1,
                      height: 26,
                      borderRadius: "var(--radius-inner)",
                      background: `color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`,
                    }}
                  />
                ))}
              </HStack>
            </VStack>
          </VStack>
        </Card>
      </VStack>
    </VStack>
  );
}
