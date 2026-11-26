import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@preline-ui/Button";
import type { KlineLoadStatus } from "../../../../../lib/kline-status";

export function KlineStatusOverlay({
  status,
  onRetry,
}: {
  status: KlineLoadStatus;
  onRetry: () => void | Promise<void>;
}) {
  if (status === "ready") return null;

  if (status === "loading") {
    return (
      <div
        className="absolute inset-0 z-10 flex items-center justify-center bg-quote-canvas/90"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-xs text-quote-axis">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          正在读取 K 线
        </div>
      </div>
    );
  }

  const isError = status === "error";
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-quote-canvas/95 px-6"
      role={isError ? "alert" : "status"}
    >
      <div className="max-w-sm text-center">
        <TriangleAlert
          className={`mx-auto size-5 ${isError ? "text-quote-up" : "text-quote-flat"}`}
          aria-hidden
        />
        <strong className="mt-2 block text-xs text-quote-ink">
          {isError ? "K 线读取失败" : "暂无 K 线数据"}
        </strong>
        <p className="mt-1 text-[11px] leading-5 text-quote-axis">
          {isError
            ? "行情摘要和资金结构仍可查看，可重新加载当前周期。"
            : "当前标的与周期没有可用数据，可稍后重新加载。"}
        </p>
        <Button
          className="mt-3"
          label="重新加载"
          size="sm"
          variant={isError ? "primary" : "secondary"}
          onClick={() => {
            void Promise.resolve(onRetry());
          }}
        />
      </div>
    </div>
  );
}
