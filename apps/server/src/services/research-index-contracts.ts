export const RESEARCH_EXTRACTOR_VERSION = "pymupdf+ocr-v1";
export const RESEARCH_CHUNK_VERSION = "v1";
export const RESEARCH_EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5";
export const RESEARCH_INDEX_WINDOW_DAYS = 30;
export const RESEARCH_METADATA_SYNC_SOURCE = "eastmoney";
export const RESEARCH_METADATA_SYNC_ENDPOINT = "research-reports-metadata";
export const RESEARCH_METADATA_SYNC_TIMEFRAME = "12m";

export type ResearchIndexTrigger = "analysis" | "manual" | "recovery" | "watchlist";

export type ResearchIndexJob =
  | {
      kind: "metadata";
      symbol: string;
      trigger: ResearchIndexTrigger;
    }
  | {
      kind: "report";
      reportId: number;
      symbol: string;
      trigger: ResearchIndexTrigger;
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
  const priority =
    job.trigger === "analysis"
      ? 30
      : job.trigger === "manual"
        ? 20
        : job.trigger === "recovery"
          ? 10
          : 5;
  return {
    singletonKey:
      job.kind === "metadata"
        ? `research-metadata:${job.symbol}`
        : `research-index:${job.reportId}:${RESEARCH_EXTRACTOR_VERSION}:${RESEARCH_CHUNK_VERSION}:${RESEARCH_EMBEDDING_MODEL}`,
    singletonSeconds: job.kind === "metadata" ? 86_400 : 600,
    priority,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  };
}
