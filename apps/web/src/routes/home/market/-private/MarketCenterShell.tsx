import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChartNoAxesCombined } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { UnderConstructionPage } from "../../../../components/UnderConstructionPage";
import { useSystemFeaturesQuery } from "../../../../hooks/useSystemFeatures";
import { MARKET_CENTER_TABS, marketCenterTabForPath } from "../../../../lib/market-center";

export function MarketCenterShell({
  children,
  variant = "full",
}: {
  children: ReactNode;
  variant?: "full" | "stock";
}) {
  const location = useLocation();
  const features = useSystemFeaturesQuery();
  const active = marketCenterTabForPath(location.pathname);

  if (features.isLoading) {
    return (
      <div className="w-full space-y-4" aria-label="行情中心加载中">
        <div className="h-16 animate-pulse rounded-2xl bg-app-surface" />
        <div className="h-[500px] animate-pulse rounded-2xl bg-app-surface" />
      </div>
    );
  }

  if (features.isError || !features.data?.marketCenter) {
    return (
      <UnderConstructionPage
        title="行情中心"
        description="统一观察市场行情、板块变化、轮动与资金结构。"
      />
    );
  }

  if (variant === "stock") {
    return <div className="w-full space-y-4">{children}</div>;
  }

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-primary">
            <span className="h-0.5 w-[18px] rounded-full bg-current" />
            MARKET CENTER
          </p>
          <Heading level={1} className="mt-1.5 text-[40px] tracking-[-0.055em]">
            行情中心
          </Heading>
          <Text type="supporting" as="p" className="mt-1 text-xs">
            从市场风格与资产强弱下钻到板块、个股与资金结构
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-app-line bg-app-panel px-3 text-[11px] text-app-muted">
            <span className="size-1.5 rounded-full bg-app-warning" />
            最近收盘快照
          </span>
          <Button
            variant="secondary"
            size="sm"
            label="刷新数据"
            onClick={() => globalThis.location.reload()}
          />
        </div>
      </header>
      <nav className="grid grid-cols-3 border-b border-app-line" aria-label="行情中心模块">
        {MARKET_CENTER_TABS.map((tab) => {
          const selected = active === tab.key;
          return (
            <Link
              key={tab.key}
              to={tab.href}
              className={`focus-ring flex min-h-12 items-center justify-center gap-2 border-b-2 px-3 text-xs font-semibold transition ${
                selected
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-transparent text-app-muted hover:bg-app-panel hover:text-app-ink"
              }`}
              aria-current={selected ? "page" : undefined}
            >
              {tab.key === "overview" ? <ChartNoAxesCombined className="size-4" /> : null}
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

export function MarketCenterError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="flex min-h-[320px] items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <strong className="text-base text-app-ink">{title}</strong>
        <Text type="supporting" as="p" className="mt-2 text-xs leading-6">
          {message}
        </Text>
        {onRetry ? (
          <Button
            className="mt-4"
            variant="secondary"
            size="sm"
            label="重新加载"
            onClick={onRetry}
          />
        ) : null}
      </div>
    </Card>
  );
}
