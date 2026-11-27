import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Skeleton } from "@preline-ui/Skeleton";

const StockAnalysisDetail = lazy(() =>
  import("../../analysis/-private/StockAnalysisDetail.tsx").then((module) => ({
    default: module.StockAnalysisDetail,
  })),
);

function ResearchLoading() {
  return (
    <section className="space-y-3" aria-label="正在加载深度研究">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Skeleton height={12} width={120} />
          <div className="mt-2">
            <Skeleton height={30} width={180} />
          </div>
        </div>
        <Skeleton height={24} width={84} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Skeleton height={320} width="100%" />
        <Skeleton height={320} width="100%" />
      </div>
      <Skeleton height={220} width="100%" />
    </section>
  );
}

interface ResearchBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface ResearchBoundaryState {
  error: Error | null;
}

class ResearchBoundary extends Component<ResearchBoundaryProps, ResearchBoundaryState> {
  override state: ResearchBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ResearchBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[stock-workspace] research module failed", error, info);
  }

  override componentDidUpdate(previous: ResearchBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <section
        role="alert"
        className="border border-destructive/25 bg-destructive/[0.035] px-5 py-6"
      >
        <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold text-app-ink">深度研究模块加载失败</h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-6 text-app-muted">
          {this.state.error.message || "研究代码或数据请求未完成。"}
          行情底稿、股票头和页面导航仍然可用，可以单独重试研究区域。
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          label="重试研究区域"
          icon={<RotateCcw className="size-3.5" />}
          onClick={() => this.setState({ error: null })}
        />
      </section>
    );
  }
}

export function StockResearchPanel({
  symbol,
  onQuick,
}: {
  symbol: string;
  onQuick: () => void;
}) {
  return (
    <ResearchBoundary resetKey={symbol}>
      <Suspense fallback={<ResearchLoading />}>
        <StockAnalysisDetail key={symbol} symbol={symbol} embedded onReturnQuick={onQuick} />
      </Suspense>
    </ResearchBoundary>
  );
}
