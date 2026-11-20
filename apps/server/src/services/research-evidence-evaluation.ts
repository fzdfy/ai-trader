import type { ResearchEvidenceItem, ResearchEvidenceResult } from "./research-evidence-service";

export interface ResearchGoldenCase {
  id: string;
  symbol: string;
  query: string;
  asOf?: string;
  expectedSourceIds: string[];
  expectedPages?: number[];
  forbiddenSourceIds?: string[];
  expectedMode?: ResearchEvidenceResult["mode"];
}

type Retrieve = (input: {
  symbol: string;
  query: string;
  asOf?: string;
  limit?: number;
}) => Promise<ResearchEvidenceResult>;

export interface ResearchEvidenceCaseResult {
  id: string;
  passed: boolean;
  mode: ResearchEvidenceResult["mode"] | null;
  failures: string[];
  returnedSourceIds: string[];
}

export interface ResearchEvidenceEvaluation {
  passed: number;
  failed: number;
  results: ResearchEvidenceCaseResult[];
}

function dateValue(value: string): number {
  return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function citationIsValid(item: ResearchEvidenceItem): boolean {
  const validDate = Number.isFinite(dateValue(item.publishDate));
  const pagesValid =
    item.pageFrom == null && item.pageTo == null
      ? true
      : Number.isInteger(item.pageFrom) &&
        Number.isInteger(item.pageTo) &&
        item.pageFrom! > 0 &&
        item.pageTo! >= item.pageFrom!;
  return (
    Number.isInteger(item.reportId) &&
    item.reportId > 0 &&
    item.sourceId.trim().length > 0 &&
    item.title.trim().length > 0 &&
    validDate &&
    pagesValid
  );
}

export async function evaluateResearchEvidence(
  fixtures: readonly ResearchGoldenCase[],
  retrieve: Retrieve,
): Promise<ResearchEvidenceEvaluation> {
  const results = await Promise.all(
    fixtures.map(async (fixture): Promise<ResearchEvidenceCaseResult> => {
      const failures: string[] = [];
      let result: ResearchEvidenceResult | null = null;
      try {
        result = await retrieve({
          symbol: fixture.symbol,
          query: fixture.query,
          asOf: fixture.asOf,
          limit: 8,
        });
      } catch (error) {
        failures.push(
          `retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const items = result?.items ?? [];
      const returnedSourceIds = items.map((item) => item.sourceId);
      const returned = new Set(returnedSourceIds);
      const missing = fixture.expectedSourceIds.filter((sourceId) => !returned.has(sourceId));
      if (missing.length > 0) {
        failures.push(`missing expected source: ${missing.join(", ")}`);
      }
      if (fixture.expectedMode && result?.mode !== fixture.expectedMode) {
        failures.push(`expected ${fixture.expectedMode} mode, received ${result?.mode ?? "none"}`);
      }
      const forbidden = (fixture.forbiddenSourceIds ?? []).filter((sourceId) =>
        returned.has(sourceId),
      );
      if (forbidden.length > 0) {
        failures.push(`forbidden source returned: ${forbidden.join(", ")}`);
      }
      if (
        fixture.asOf &&
        items.some((item) => dateValue(item.publishDate) > dateValue(fixture.asOf!))
      ) {
        failures.push(`evidence published after asOf ${fixture.asOf}`);
      }
      if (items.some((item) => !citationIsValid(item))) {
        failures.push("invalid citation");
      }
      const missingPages = (fixture.expectedPages ?? []).filter(
        (page) =>
          !items.some(
            (item) =>
              item.pageFrom != null &&
              item.pageTo != null &&
              item.pageFrom <= page &&
              page <= item.pageTo,
          ),
      );
      if (missingPages.length > 0) {
        failures.push(`missing expected page: ${missingPages.join(", ")}`);
      }

      return {
        id: fixture.id,
        passed: failures.length === 0,
        mode: result?.mode ?? null,
        failures,
        returnedSourceIds,
      };
    }),
  );
  const passed = results.filter((result) => result.passed).length;
  return { passed, failed: results.length - passed, results };
}
