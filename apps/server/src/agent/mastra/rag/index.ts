/**
 * RAG 检索增强生成模块 — 基于 pgvector
 *
 * 用于智能问股：从 news.embedding 表检索相关文本块，
 * 作为 AI agent 的上下文。
 */

import { db } from "../../../db";
import { newsEmbedding } from "../../../db/schema";
import { sql, desc, and, eq } from "drizzle-orm";

const VECTOR_DIM = 1536;

/**
 * 向量相似度检索
 *
 * @param queryEmbedding 1536 维向量
 * @param limit 返回条数
 * @param threshold 相似度阈值
 */
export async function similaritySearch(
  queryEmbedding: number[],
  limit = 5,
  threshold = 0.7,
): Promise<{ chunkText: string; entityType: string; entityId: number; similarity: number }[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const rows = await db.execute(
    sql`
      SELECT
        chunk_text,
        entity_type,
        entity_id,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM news.embedding
      WHERE 1 - (embedding <=> ${vectorStr}::vector) > ${threshold}
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `,
  );

  return (
    rows as unknown as {
      chunk_text: string;
      entity_type: string;
      entity_id: number;
      similarity: number;
    }[]
  ).map((r) => ({
    chunkText: r.chunk_text,
    entityType: r.entity_type,
    entityId: r.entity_id,
    similarity: r.similarity,
  }));
}

/**
 * 全文检索（tsvector 降级方案）
 */
export async function keywordSearch(
  query: string,
  limit = 5,
): Promise<{ chunkText: string; entityType: string; entityId: number }[]> {
  const rows = await db.execute(
    sql`
      SELECT chunk_text, entity_type, entity_id
      FROM news.embedding
      WHERE tsv @@ plainto_tsquery('chinese', ${query})
      ORDER BY ts_rank(tsv, plainto_tsquery('chinese', ${query})) DESC
      LIMIT ${limit}
    `,
  );

  return (
    rows as unknown as {
      chunk_text: string;
      entity_type: string;
      entity_id: number;
    }[]
  ).map((r) => ({
    chunkText: r.chunk_text,
    entityType: r.entity_type,
    entityId: r.entity_id,
  }));
}

/**
 * 写入嵌入向量 + tsvector
 */
export async function upsertEmbedding(
  entityType: string,
  entityId: number,
  chunkText: string,
  embedding: number[],
): Promise<void> {
  const vectorStr = `[${embedding.join(",")}]`;

  await db.execute(
    sql`
      INSERT INTO news.embedding (entity_type, entity_id, chunk_text, embedding, tsv)
      VALUES (
        ${entityType},
        ${entityId},
        ${chunkText},
        ${vectorStr}::vector,
        to_tsvector('chinese', ${chunkText})
      )
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        chunk_text = EXCLUDED.chunk_text,
        embedding = EXCLUDED.embedding,
        tsv = EXCLUDED.tsv
    `,
  );
}
