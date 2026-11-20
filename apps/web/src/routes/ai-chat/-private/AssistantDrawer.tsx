import { useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { History, Maximize2, Minus, Plus, Sparkles, type LucideIcon } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { useLastUpdated } from "../../../hooks/useDataSync";
import {
  createAssistantThread,
  fetchAssistantThreads,
  writeAssistantSourcePath,
  type AssistantThread,
} from "../../../lib/assistant";
import { assistantWorkspacePath, isDrawerDismissKey } from "../../../lib/workbench-navigation";

interface AssistantDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pageTitle: string;
  threadId: string | null;
  onThreadChange: (threadId: string | null) => void;
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

function formatThreadTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function AssistantHeaderButton({
  label,
  icon: Icon,
  isExpanded,
  buttonRef,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  isExpanded?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
      aria-label={label}
      title={label}
      aria-expanded={isExpanded}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function AssistantDrawer({
  isOpen,
  onOpenChange,
  pageTitle,
  threadId,
  onThreadChange,
}: AssistantDrawerProps) {
  const location = useLocation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historyCloseButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const creatingThreadRef = useRef(false);
  const [newSessionGeneration, setNewSessionGeneration] = useState(0);
  const [initialQuestion, setInitialQuestion] = useState<string>();
  const [error, setError] = useState("");
  const { data: syncInfo } = useLastUpdated();

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDrawerDismissKey(event.key)) {
        event.preventDefault();
        if (historyOpen) {
          setHistoryOpen(false);
        } else {
          onOpenChange(false);
        }
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;

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
      const fallback = document.getElementById("assistant-fab");
      if (
        previousFocus &&
        previousFocus !== document.body &&
        !drawerRef.current?.contains(previousFocus)
      ) {
        previousFocus.focus();
      } else {
        fallback?.focus();
      }
    };
  }, [historyOpen, isOpen, onOpenChange]);

  useEffect(() => {
    if (!historyOpen) return;
    historyCloseButtonRef.current?.focus();

    return () => {
      historyButtonRef.current?.focus();
    };
  }, [historyOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setThreadsLoading(true);
    fetchAssistantThreads(controller.signal)
      .then(setThreads)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "加载会话失败");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setThreadsLoading(false);
      });
    return () => controller.abort();
  }, [isOpen]);

  const openNewSession = () => {
    setHistoryOpen(false);
    setInitialQuestion(undefined);
    setError("");
    setNewSessionGeneration((generation) => generation + 1);
    onThreadChange(null);
  };

  const openThread = (id: string) => {
    setHistoryOpen(false);
    setInitialQuestion(undefined);
    setError("");
    onThreadChange(id);
  };

  const createThread = async (question: string) => {
    if (creatingThreadRef.current) return;
    creatingThreadRef.current = true;
    try {
      setError("");
      const nextThreadId = await createAssistantThread();
      setInitialQuestion(question);
      onThreadChange(nextThreadId);
      setThreads(await fetchAssistantThreads());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "创建会话失败");
    } finally {
      creatingThreadRef.current = false;
    }
  };

  return (
    <>
      <button
        type="button"
        className="assistant-drawer-scrim"
        aria-label="关闭 AI 研究助手"
        hidden={!isOpen}
        onClick={() => onOpenChange(false)}
      />
      <aside
        ref={drawerRef}
        id="assistant-drawer"
        role="dialog"
        aria-modal={isOpen ? true : undefined}
        aria-label="AI 研究助手"
        aria-hidden={!isOpen}
        className={`assistant-drawer ${isOpen ? "is-open" : ""}`}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="flex min-h-16 shrink-0 items-center gap-2 border-b border-app-line px-3"
            style={{
              background:
                "linear-gradient(110deg, color-mix(in srgb, var(--primary) 7%, var(--panel)), color-mix(in srgb, var(--warning) 8%, var(--panel)))",
            }}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-app-ink">量化助手</p>
              <p className="mt-0.5 truncate text-[11px] text-app-muted">
                QUANT COPILOT
              </p>
            </div>
            <AssistantHeaderButton
              label="新建会话"
              icon={Plus}
              onClick={openNewSession}
            />
            <AssistantHeaderButton
              buttonRef={historyButtonRef}
              label="历史会话"
              icon={History}
              isExpanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
            />
            <Link
              to={assistantWorkspacePath(threadId) as "/ai-chat"}
              className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
              aria-label="进入完整会话"
              title="进入完整会话"
              onClick={() => {
                writeAssistantSourcePath(location.href);
                onOpenChange(false);
              }}
            >
              <Maximize2 className="size-4" />
            </Link>
            <AssistantHeaderButton
              buttonRef={closeButtonRef}
              label="收起助手"
              icon={Minus}
              onClick={() => onOpenChange(false)}
            />
          </div>

          <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-app-line bg-app-surface/55 px-4 text-[11px] text-app-muted">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            <strong className="min-w-0 truncate font-medium text-app-ink">{pageTitle}</strong>
            <span className="ml-auto shrink-0">
              数据同步 {formatSyncTime(syncInfo?.updatedAt)}
            </span>
          </div>

          {error ? (
            <p className="border-b border-app-line bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <div className="relative min-h-0 flex-1">
            <div
              inert={historyOpen ? true : undefined}
              className="flex h-full min-h-0 flex-col"
            >
              <ChatPanel
                key={threadId ?? `new-${newSessionGeneration}`}
                threadId={threadId}
                initialQuestion={initialQuestion}
                onFirstSend={createThread}
              />
            </div>

            {historyOpen ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="最近会话"
                className="absolute inset-0 z-10 overflow-y-auto bg-app-panel p-3"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-app-ink">最近会话</p>
                  <button
                    ref={historyCloseButtonRef}
                    type="button"
                    className="focus-ring rounded-md px-2 py-1 text-xs text-app-muted hover:bg-app-surface hover:text-app-ink"
                    onClick={() => setHistoryOpen(false)}
                  >
                    关闭
                  </button>
                </div>
                {threadsLoading ? (
                  <p className="px-2 py-6 text-center text-xs text-app-muted">正在加载会话…</p>
                ) : threads.length > 0 ? (
                  <div className="space-y-1">
                    {threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        className={`focus-ring w-full rounded-xl px-3 py-2.5 text-left transition ${
                          thread.id === threadId
                            ? "bg-primary/10 text-app-ink"
                            : "text-app-muted hover:bg-app-surface hover:text-app-ink"
                        }`}
                        onClick={() => openThread(thread.id)}
                      >
                        <span className="block truncate text-sm font-medium">
                          {thread.title || "新会话"}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-app-faint">
                          {formatThreadTime(thread.updatedAt || thread.createdAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-6 text-center text-xs text-app-muted">暂无历史会话</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
