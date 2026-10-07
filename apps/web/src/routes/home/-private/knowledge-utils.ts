import type { ReactNode } from "react";
import { KNOWLEDGE_DOCS } from "../../../generated/knowledge";

const SLUG_STRIP_RE = /[^\p{L}\p{N}\s_-]/gu;
const SLUG_SPACE_RE = /\s/g;

const DOC_SLUG_BY_FILE = new Map(KNOWLEDGE_DOCS.map((doc) => [doc.file, doc.slug]));

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replaceAll(SLUG_STRIP_RE, "")
    .replaceAll(SLUG_SPACE_RE, "-");
}

export function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => nodeToText(child)).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return nodeToText(props?.children);
  }
  return "";
}

export function resolveDocSlug(href: string): string | undefined {
  const path = href.split("#")[0]?.split("?")[0] ?? "";
  const base = path.split("/").pop();
  if (!base) return undefined;
  return DOC_SLUG_BY_FILE.get(base);
}
