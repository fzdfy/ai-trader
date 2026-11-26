import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Layers3, RefreshCw } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { ToggleButton, ToggleButtonGroup } from "@preline-ui/ToggleButton";
import { useMarketRotation } from "../../../../hooks/useMarketCenter";
import { formatRotationValue, type RotationWindow } from "../../../../lib/market-center";

const ASSET_ROLE: Record<string, string> = {
  "588000.SH": "成长资产领先",
  "510300.SH": "宽基温和修复",
  IXIC: "海外权益延续",
  XAUUSD: "避险需求回落",
};

export function CrossAssetRotationPanel() {
  const [window, setWindow] = useState<RotationWindow>("20D");
  const rotation = useMarketRotation("asset", window);
  const maxAbs = Math.max(
    1,
    ...(rotation.data?.rows.map((row) => Math.abs(row.relativeReturn ?? 0)) ?? []),
  );

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-app-line px-4 py-3.5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="size-4 text-primary" />
            <Heading level={2} className="text-sm">
              大类资产轮动
            </Heading>
          </div>
          <Text type="supporting" as="p" className="mt-1 text-[10px]">
            A 股宽基、A 股成长、黄金与海外权益 · 独立观察
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <ToggleButtonGroup
            label="大类资产轮动统计窗口"
            value={window}
            onChange={(value) => setWindow(value as RotationWindow)}
          >
            <ToggleButton value="5D" label="5日" />
            <ToggleButton value="20D" label="20日" />
            <ToggleButton value="60D" label="60日" />
          </ToggleButtonGroup>
          <span className="rounded-full bg-app-surface px-2.5 py-1.5 font-mono text-[9px] text-app-muted">
            {rotation.data?.asOf ?? "暂无日期"}
          </span>
          <Link
            to="/home/market/gold"
            className="focus-ring rounded-md px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5"
          >
            黄金分析
          </Link>
        </div>
      </div>

      {rotation.isLoading ? (
        <div className="grid gap-px bg-app-line md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={`asset-skeleton-${index}`} className="h-16 animate-pulse bg-app-surface" />
          ))}
        </div>
      ) : rotation.isError || !rotation.data ? (
        <div className="flex min-h-36 flex-col items-center justify-center px-6 text-center">
          <CircleAlert className="size-5 text-destructive" />
          <strong className="mt-2 text-xs text-app-ink">大类资产轮动暂时无法读取</strong>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            label="重新加载"
            icon={<RefreshCw className="size-4" />}
            onClick={() => void rotation.refetch()}
          />
        </div>
      ) : (
        <div className="grid gap-px bg-app-line md:grid-cols-2">
          {rotation.data.rows.map((row) => (
            <div
              key={row.code}
              className="grid min-h-16 grid-cols-[26px_minmax(95px,1fr)_minmax(58px,.8fr)_72px] items-center gap-2 bg-app-panel px-3 py-2"
            >
              <span className="font-mono text-[10px] text-app-muted">
                {row.rank == null ? "—" : String(row.rank).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-xs text-app-ink">{row.name}</strong>
                <span className="mt-0.5 block truncate font-mono text-[9px] text-app-muted">
                  {row.code} · {ASSET_ROLE[row.code] ?? row.phase}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-app-surface" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.max(6, (Math.abs(row.relativeReturn ?? 0) / maxAbs) * 100)}%`,
                  }}
                />
              </div>
              <span
                className={`text-right font-mono text-[11px] font-semibold ${
                  (row.relativeReturn ?? 0) >= 0 ? "text-chart-up-strong" : "text-chart-down-strong"
                }`}
              >
                {formatRotationValue(row.relativeReturn, 1)}
              </span>
            </div>
          ))}
          {rotation.data.rows.length === 0 ? (
            <p className="col-span-full bg-app-panel py-10 text-center text-xs text-app-muted">
              暂无同步日线可比较
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
