export const RESEARCH_EXTRACTOR_VERSION = "pymupdf+ocr-v1";
export const RESEARCH_CHUNK_VERSION = "v1";
export const RESEARCH_EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5";
export const RESEARCH_INDEX_WINDOW_DAYS = 30;

export type ResearchIndexJob =
  | {
      kind: "metadata";
      symbol: string;
      trigger: "analysis" | "manual" | "recovery";
    }
  | {
      kind: "report";
      reportId: number;
      symbol: string;
      trigger: "analysis" | "manual" | "recovery";
    };

export interface ResearchIndexStatus {
  symbol: string;
  windowDays: number;
  total: number;
  pending: number;
  extracted: number;
  failed: number;
  action: "sync_metadata" | "index_reports" | "none";
  observedAt: string;
}

export interface ResearchIndexSendOptions {
  singletonKey: string;
  singletonSeconds: number;
  priority: number;
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
}

export function researchIndexJobOptions(job: ResearchIndexJob): ResearchIndexSendOptions {
  return {
    singletonKey:
      job.kind === "metadata"
        ? `research-metadata:${job.symbol}`
        : `research-index:${job.reportId}:${RESEARCH_EXTRACTOR_VERSION}:${RESEARCH_CHUNK_VERSION}:${RESEARCH_EMBEDDING_MODEL}`,
    singletonSeconds: job.kind === "metadata" ? 86_400 : 600,
    priority: 10,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  };
}
