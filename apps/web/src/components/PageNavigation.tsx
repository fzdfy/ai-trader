import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, History, Menu, Search, X } from "lucide-react";
import { useLastUpdated } from "../hooks/useDataSync";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  getSyncAvailability,
  getWorkbenchBreadcrumbs,
  getWorkbenchPageTitle,
  isDrawerDismissKey,
  searchWorkbenchPages,
} from "../lib/workbench-navigation";

interface PageNavigationProps {
  onOpenMobileMenu?: () => void;
  onOpenMobileHistory?: () => void;
  mobileMenuButtonRef?: RefObject<HTMLButtonElement | null>;
  mobileHistoryButtonRef?: RefObject<HTMLButtonElement | null>;
}

function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return "等待同步";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "等待同步";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function PageNavigation({
  onOpenMobileMenu,
  onOpenMobileHistory,
  mobileMenuButtonRef,
  mobileHistoryButtonRef,
}: PageNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { data: currentUser } = useCurrentUser();
  const { data: syncInfo, isError: syncError, isLoading: syncLoading } = useLastUpdated();
  const pageTitle = getWorkbenchPageTitle(location.pathname);
  const analysisPrefix = "/home/market/analysis/";
  const analysisSymbol =
    location.pathname.startsWith(analysisPrefix) && location.pathname !== `${analysisPrefix}compare`
      ? decodeURIComponent(location.pathname.slice(analysisPrefix.length))
      : null;
  const { data: analysisStockName } = useQuery({
    queryKey: ["instrument-name", analysisSymbol],
    queryFn: async () => {
      const response = await fetch(`/api/v1/instruments/${encodeURIComponent(analysisSymbol!)}`);
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        success?: boolean;
        data?: { name?: string | null };
      };
      return payload.success ? (payload.data?.name ?? null) : null;
    },
    staleTime: 10 * 60_000,
    enabled: Boolean(analysisSymbol),
  });
  const breadcrumbs = getWorkbenchBreadcrumbs(location.pathname, {
    stockName: analysisStockName,
  });
  const showMobileMenu = location.pathname.startsWith("/home") && breadcrumbs.length === 2;
  const showMobileHistory = location.pathname.startsWith("/ai-chat");
  const results = searchWorkbenchPages(query, currentUser?.role ?? null);
  const syncAvailability = getSyncAvailability({
    isLoading: syncLoading,
    isError: syncError,
    updatedAt: syncInfo?.updatedAt,
  });

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDrawerDismissKey(event.key)) {
        event.preventDefault();
        setSearchOpen(false);
        setQuery("");
        return;
      }
      if (event.key !== "Tab" || !searchDialogRef.current) return;
      const focusable = Array.from(
        searchDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      searchButtonRef.current?.focus();
    };
  }, [searchOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const openSearch = () => {
    setSearchOpen(true);
  };

  const selectResult = (href: string) => {
    closeSearch();
    void navigate({ to: href as "/home" });
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDrawerDismissKey(event.key)) {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex].href);
    }
  };

  return (
    <>
      <div className="page-navigation-bar">
        {showMobileMenu ? (
          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg border border-app-line bg-app-panel text-app-muted lg:hidden"
            aria-label="打开工作台导航"
            onClick={onOpenMobileMenu}
          >
            <Menu className="size-4" />
          </button>
        ) : null}
        {showMobileHistory ? (
          <button
            ref={mobileHistoryButtonRef}
            type="button"
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg border border-app-line bg-app-panel text-app-muted lg:hidden"
            aria-label="打开会话历史"
            onClick={onOpenMobileHistory}
          >
            <History className="size-4" />
          </button>
        ) : null}
        <nav className="page-navigation-crumb" aria-label={`${pageTitle} 页面导航`}>
          {breadcrumbs.map((crumb, index) => (
            <Fragment key={`${crumb.label}-${crumb.href ?? "current"}`}>
              {index > 0 ? (
                <span className="page-navigation-separator" aria-hidden="true">
                  /
                </span>
              ) : null}
              {crumb.href ? (
                <Link
                  to={crumb.href as "/home"}
                  activeOptions={{ exact: true }}
                  className={index === 0 ? "page-navigation-brand" : "page-navigation-link"}
                >
                  {crumb.label}
                </Link>
              ) : (
                <strong className="page-navigation-current" aria-current="page">
                  {crumb.label}
                </strong>
              )}
            </Fragment>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="page-navigation-status">
            <span
              className={`size-1.5 rounded-full ${
                syncAvailability === "unavailable"
                  ? "bg-destructive"
                  : syncAvailability === "loading"
                    ? "bg-app-faint"
                    : "bg-app-warning"
              }`}
            />
            {syncAvailability === "unavailable"
              ? "同步状态不可用"
              : syncAvailability === "loading"
                ? "读取同步状态"
                : `${formatSyncTime(syncInfo?.updatedAt)} · 数据在线`}
          </span>
          <button
            ref={searchButtonRef}
            type="button"
            className="focus-ring page-navigation-search"
            aria-label="搜索页面和操作"
            onClick={openSearch}
          >
            <Search className="size-3.5 shrink-0" />
            <span className="page-navigation-search-label">搜索页面或操作</span>
            <kbd className="page-navigation-shortcut">⌘ K</kbd>
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-app-ink/25 px-4 pt-[12vh] backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <div
            ref={searchDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="搜索页面和操作"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-app-line bg-app-panel shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-app-line px-4">
              <Search className="size-4 shrink-0 text-app-muted" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="h-13 min-w-0 flex-1 border-0 bg-transparent text-sm text-app-ink outline-none focus:ring-0 placeholder:text-app-faint"
                placeholder="搜索页面或操作…"
                aria-label="搜索页面或操作"
              />
              <button
                type="button"
                className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
                aria-label="关闭搜索"
                onClick={closeSearch}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length > 0 ? (
                results.map((item, index) => (
                  <button
                    key={`${item.href}-${item.label}`}
                    type="button"
                    className={`focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      index === activeIndex
                        ? "bg-primary/10 text-app-ink"
                        : "text-app-muted hover:bg-app-surface hover:text-app-ink"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectResult(item.href)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-app-faint">
                        {item.description}
                      </span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0" />
                  </button>
                ))
              ) : (
                <p className="px-3 py-8 text-center text-sm text-app-muted">没有匹配的页面或操作</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
