import assert from "node:assert/strict";
import test from "node:test";
import { resolveReportStoragePath } from "./research-report-storage.ts";

test("resolves report PDFs inside the configured storage root", () => {
  assert.equal(
    resolveReportStoragePath("/data/reports", "eastmoney/2026/11/report.pdf"),
    "/data/reports/eastmoney/2026/11/report.pdf",
  );
});

test("rejects report paths that escape the storage root", () => {
  assert.equal(resolveReportStoragePath("/data/reports", "../secret.pdf"), null);
  assert.equal(resolveReportStoragePath("/data/reports", "/etc/passwd"), null);
  assert.equal(resolveReportStoragePath("/data/reports", ""), null);
});
