import { isAbsolute, relative, resolve } from "node:path";

export function resolveReportStoragePath(root: string, storageKey: string): string | null {
  if (!storageKey || isAbsolute(storageKey)) return null;
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, storageKey);
  const pathWithinRoot = relative(resolvedRoot, candidate);
  if (!pathWithinRoot || pathWithinRoot.startsWith("..") || isAbsolute(pathWithinRoot)) return null;
  return candidate;
}
