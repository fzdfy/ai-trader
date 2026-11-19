export type SourceStandardReference = {
  id: "a-stock-data";
  repository: "https://github.com/simonlin1212/a-stock-data";
  commitSha: string;
  versionLabel: string;
  skillFileSha256: string;
  reviewedAt: string;
  capabilities: string[];
  snapshotPath: string;
};

const A_STOCK_DATA: SourceStandardReference = {
  id: "a-stock-data",
  repository: "https://github.com/simonlin1212/a-stock-data",
  commitSha: "f90d67853b8108f13d286e1df20b357e2c5198a9",
  versionLabel: "3.7.1",
  skillFileSha256:
    "5c4572af0d4483560b7c78b5f53c34019ff6f5cf839275a2d149b37c3bdc1973",
  reviewedAt: "2026-08-20T05:05:28Z",
  capabilities: [
    "kline",
    "quote",
    "transaction",
    "adjust_factor",
    "board",
    "fund_flow",
    "limit_up_pool",
    "dragon_tiger",
    "hot_reason",
    "research_report",
    "financial_statement",
    "announcement",
    "news",
    "valuation_history",
  ],
  snapshotPath:
    "docs/external/a-stock-data/f90d67853b8108f13d286e1df20b357e2c5198a9",
};

export function getSourceStandardReference(
  id: "a-stock-data",
): SourceStandardReference {
  if (id !== A_STOCK_DATA.id) throw new Error(`unknown source standard: ${id}`);
  return A_STOCK_DATA;
}
