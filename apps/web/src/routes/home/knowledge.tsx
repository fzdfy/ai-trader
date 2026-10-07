import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Heading } from "@astryxdesign/core/Heading";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Outline, useOutlineFromDOM } from "@astryxdesign/core/Outline";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Text } from "@astryxdesign/core/Text";
import { Stack, StackItem } from "@astryxdesign/core/Stack";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { KNOWLEDGE_DOCS, KNOWLEDGE_GENERATED_AT } from "../../generated/knowledge";
import { nodeToText, resolveDocSlug, slugifyHeading } from "./-private/knowledge-utils";
import { MermaidBlock } from "./-private/MermaidBlock";

const EXTERNAL_LINK_RE = /^https?:\/\//i;

function KnowledgeHeading({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
}) {
  const id = slugifyHeading(nodeToText(children));
  return (
    <Heading
      level={level}
      id={id || undefined}
      style={{ scrollMarginTop: "var(--spacing-4)", marginTop: "var(--spacing-4)" }}
    >
      {children}
    </Heading>
  );
}

function KnowledgeCode({ code, language }: { code: string; language?: string }) {
  if (language === "mermaid") {
    return <MermaidBlock chart={code} />;
  }
  return <CodeBlock code={code} language={language} width="100%" isWrapped />;
}

const MARKDOWN_COMPONENTS = { heading: KnowledgeHeading, code: KnowledgeCode };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export const Route = createFileRoute("/home/knowledge")({
  validateSearch: (search: Record<string, unknown>): { doc: string } => ({
    doc: typeof search.doc === "string" && search.doc ? search.doc : "overview",
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const { doc: docSlug } = Route.useSearch();
  const navigate = Route.useNavigate();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");

  const activeDoc = useMemo(
    () => KNOWLEDGE_DOCS.find((item) => item.slug === docSlug) ?? KNOWLEDGE_DOCS[0],
    [docSlug],
  );

  const outlineItems = useOutlineFromDOM(contentRef);

  const filteredDocs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return KNOWLEDGE_DOCS;
    return KNOWLEDGE_DOCS.filter(
      (item) =>
        item.label.toLowerCase().includes(keyword) ||
        item.title.toLowerCase().includes(keyword),
    );
  }, [query]);

  const selectDoc = useCallback(
    (slug: string) => {
      navigate({ search: { doc: slug }, replace: true });
    },
    [navigate],
  );

  const handleLinkClick = useCallback(
    (href: string): void | false => {
      if (href.startsWith("#")) return;
      if (EXTERNAL_LINK_RE.test(href)) return;
      const slug = resolveDocSlug(href);
      if (slug) {
        navigate({ search: { doc: slug }, replace: true });
      }
      return false;
    },
    [navigate],
  );

  if (!activeDoc) {
    return <EmptyState title="暂无文档" description="知识库还没有可展示的内容。" />;
  }

  return (
    <Stack direction="horizontal" gap={6} align="start" width="100%">
      <StackItem size="static" style={{ position: "sticky", top: 0, width: 220, flexShrink: 0 }}>
        <Stack gap={3}>
          <TextInput
            label="搜索文档"
            isLabelHidden
            value={query}
            onChange={setQuery}
            placeholder="按名称筛选"
            hasClear
            size="sm"
          />
          {filteredDocs.length === 0 ? (
            <Text size="sm" type="supporting">
              没有匹配的文档
            </Text>
          ) : (
            <List>
              {filteredDocs.map((item) => (
                <ListItem
                  key={item.slug}
                  label={item.label}
                  description={item.file}
                  isSelected={item.slug === activeDoc.slug}
                  onClick={() => selectDoc(item.slug)}
                />
              ))}
            </List>
          )}
        </Stack>
      </StackItem>

      <StackItem size="fill" style={{ minWidth: 0, maxWidth: 800 }}>
        <Stack gap={4}>
          <Stack gap={1}>
            <Heading level={1}>{activeDoc.title}</Heading>
            <Text size="sm" type="supporting">
              {activeDoc.file} · 知识库共 {KNOWLEDGE_DOCS.length} 篇 · 更新于 {formatGeneratedAt(KNOWLEDGE_GENERATED_AT)}
            </Text>
          </Stack>
          {activeDoc.markdown.trim() ? (
            <Markdown
              ref={contentRef}
              components={MARKDOWN_COMPONENTS}
              onLinkClick={handleLinkClick}
            >
              {activeDoc.markdown}
            </Markdown>
          ) : (
            <EmptyState title="暂无内容" description="该文档还没有正文内容。" />
          )}
        </Stack>
      </StackItem>

      <StackItem size="static" style={{ position: "sticky", top: 0, width: 200, flexShrink: 0 }}>
        {outlineItems.length > 0 ? (
          <Outline items={outlineItems} density="compact" label="本页目录" />
        ) : null}
      </StackItem>
    </Stack>
  );
}
