export interface AssistantThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const ASSISTANT_SOURCE_STORAGE_KEY = "apollo.assistant.source";
export const OPEN_ASSISTANT_EVENT = "apollo:open-assistant";

export function requestAssistant(): void {
  window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
}

export function getAssistantSourcePath(value: unknown): string {
  if (
    typeof value === "string" &&
    !value.startsWith("/ai-chat") &&
    (value === "/home" ||
      value.startsWith("/home/") ||
      value === "/news" ||
      value.startsWith("/news?"))
  ) {
    return value;
  }
  return "/home";
}

export function readAssistantSourcePath(): string {
  try {
    return getAssistantSourcePath(sessionStorage.getItem(ASSISTANT_SOURCE_STORAGE_KEY));
  } catch {
    return "/home";
  }
}

export function writeAssistantSourcePath(path: string): void {
  try {
    sessionStorage.setItem(ASSISTANT_SOURCE_STORAGE_KEY, getAssistantSourcePath(path));
  } catch {
    // The workspace still falls back to /home when session storage is unavailable.
  }
}

export function parseAssistantThreads(payload: unknown): AssistantThread[] {
  const data = (payload as { data?: { threads?: unknown } } | null)?.data;
  return Array.isArray(data?.threads) ? (data.threads as AssistantThread[]) : [];
}

export function parseCreatedThreadId(payload: unknown): string | null {
  const id = (payload as { data?: { threadId?: unknown } } | null)?.data?.threadId;
  return typeof id === "string" && id ? id : null;
}

export async function fetchAssistantThreads(signal?: AbortSignal): Promise<AssistantThread[]> {
  const response = await fetch("/api/v1/agents/threads", { signal });
  if (!response.ok) throw new Error("加载会话失败");
  return parseAssistantThreads(await response.json());
}

export async function createAssistantThread(signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/v1/agents/threads", { method: "POST", signal });
  if (!response.ok) throw new Error("创建会话失败");
  const threadId = parseCreatedThreadId(await response.json());
  if (!threadId) throw new Error("创建会话失败");
  return threadId;
}

export async function deleteAssistantThread(threadId: string): Promise<void> {
  const response = await fetch(`/api/v1/agents/threads/${threadId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("删除会话失败");
}
