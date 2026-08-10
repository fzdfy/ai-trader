import { createFileRoute } from "@tanstack/react-router";
import { useNewsInfinite, SOURCE_LABELS } from "../hooks/useNews";
import { useRef, useEffect, useCallback } from "react";

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  cls: { bg: "var(--color-background-red)", text: "var(--color-text-on-color)" },
  eastmoney_global: { bg: "var(--color-background-blue)", text: "var(--color-text-on-color)" },
  eastmoney_stock: { bg: "var(--color-background-green)", text: "var(--color-text-on-color)" },
};

export const Route = createFileRoute("/news")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: typeof search.symbol === "string" ? search.symbol : undefined,
  }),
  component: NewsPage,
});

function NewsPage() {
  const { symbol } = Route.useSearch();
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useNewsInfinite(symbol);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const allArticles = data?.pages.flatMap((p) => p.data) ?? [];

  // IntersectionObserver 触发加载更多
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "var(--spacing-6) var(--spacing-4)", height: "100%", overflowY: "auto" }}>
      <div style={{ marginBottom: "var(--spacing-6)" }}>
        <h2 style={{ fontSize: "var(--font-size-xl)", fontWeight: 600, margin: 0, marginBottom: "var(--spacing-1)" }}>
          {symbol ? `${symbol} 新闻` : "财经资讯"}
        </h2>
        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-supporting)", margin: 0 }}>
          {symbol ? `关联 ${symbol} 的新闻` : "财联社 · 东财全球 · 个股新闻 三源聚合"}
        </p>
      </div>

      {isError && (
        <div
          style={{
            padding: "var(--spacing-4)",
            background: "var(--color-background-red)",
            color: "var(--color-text-on-color)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--spacing-4)",
          }}
        >
          加载失败: {error?.message ?? "未知错误"}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: "center", padding: "var(--spacing-10)", color: "var(--color-text-supporting)" }}>
          加载中...
        </div>
      )}

      {!isLoading && allArticles.length === 0 && (
        <div style={{ textAlign: "center", padding: "var(--spacing-10)", color: "var(--color-text-supporting)" }}>
          暂无新闻数据（sync-worker 运行后拉取）
        </div>
      )}

      {allArticles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
          {allArticles.map((article) => (
            <a
              key={article.id}
              href={article.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                padding: "var(--spacing-3) var(--spacing-4)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-strong)";
                e.currentTarget.style.boxShadow = "var(--elevation-1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-2)" }}>
                <span
                  style={{
                    flexShrink: 0,
                    marginTop: 1,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-xs)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: 500,
                    background: (SOURCE_COLORS[article.source] ?? SOURCE_COLORS.eastmoney_global).bg,
                    color: (SOURCE_COLORS[article.source] ?? SOURCE_COLORS.eastmoney_global).text,
                  }}
                >
                  {SOURCE_LABELS[article.source] ?? article.source}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "var(--font-size-md)",
                      fontWeight: 500,
                      lineHeight: 1.4,
                      marginBottom: "var(--spacing-0-5)",
                    }}
                  >
                    {article.title}
                  </div>
                  {article.summary && (
                    <div
                      style={{
                        fontSize: "var(--font-size-sm)",
                        color: "var(--color-text-supporting)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        marginBottom: "var(--spacing-1)",
                      }}
                    >
                      {article.summary}
                    </div>
                  )}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-supporting)" }}>
                    {formatTime(article.publishedAt)}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 无限滚动哨兵 + 加载指示器 */}
      <div ref={sentinelRef} style={{ height: 1, marginTop: "var(--spacing-4)" }} />
      {isFetchingNextPage && (
        <div style={{ textAlign: "center", padding: "var(--spacing-4)", color: "var(--color-text-supporting)", fontSize: "var(--font-size-sm)" }}>
          加载更多...
        </div>
      )}
      {!hasNextPage && allArticles.length > 0 && !isFetchingNextPage && (
        <div style={{ textAlign: "center", padding: "var(--spacing-6)", color: "var(--color-text-supporting)", fontSize: "var(--font-size-sm)" }}>
          已加载全部新闻
        </div>
      )}
    </div>
  );
}
