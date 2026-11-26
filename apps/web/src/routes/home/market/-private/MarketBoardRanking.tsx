import { useState } from "react";
import { Pagination } from "@preline-ui/Pagination";
import type { BoardItem } from "../../../../hooks/useBoards";
import { useSectorTechnicalSummaries } from "../../../../hooks/useTechnicalSignals";
import { SignalCell } from "../../../../components/signals/SignalCell";
import type { MarketRotationRow } from "../../../../lib/market-center";
import { formatMoney, paginateRows, paginationTokens } from "../../../../lib/market-center";

export function MarketBoardRanking({
  title,
  rows,
  rotationRows,
  subtype,
  onOpen,
}: {
  title: string;
  rows: BoardItem[];
  rotationRows: MarketRotationRow[];
  subtype: "industry" | "concept";
  onOpen: (code: string) => void;
}) {
  const [page, setPage] = useState(1);
  const rotationByCode = new Map(rotationRows.map((row) => [row.code, row]));
  const paged = paginateRows(rows, page);
  const technical = useSectorTechnicalSummaries(
    paged.rows.map((row) => row.code),
    subtype,
  );
  const technicalByCode = new Map(
    (technical.data ?? []).map((summary) => [summary.symbol, summary]),
  );
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-xs">
          <thead>
            <tr className="bg-app-surface/70 text-left text-[11px] text-app-muted">
              <th className="px-4 py-2.5 font-medium">板块</th>
              <th className="px-3 py-2.5 text-right font-medium">涨跌幅</th>
              <th className="px-3 py-2.5 text-right font-medium">主力净流入</th>
              <th className="px-3 py-2.5 font-medium">领涨股</th>
              <th className="px-4 py-2.5 text-right font-medium">阶段</th>
              <th className="px-3 py-2.5 font-medium">技术状态</th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((row) => {
              const change = Number(row.changePercent);
              const rotation = rotationByCode.get(row.code);
              const leader = typeof row.leader === "string" ? row.leader : null;
              return (
                <tr
                  key={row.code}
                  className="focus-ring cursor-pointer border-t border-app-line/70 transition hover:bg-primary/5"
                  role="link"
                  tabIndex={0}
                  aria-label={`查看 ${row.name} 板块详情`}
                  onClick={() => onOpen(row.code)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onOpen(row.code);
                  }}
                >
                  <td className="px-4 py-2.5">
                    <strong className="block text-xs text-app-ink">{row.name}</strong>
                    <span className="mt-0.5 block font-mono text-[11px] text-app-muted">
                      {row.code}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-semibold ${
                      change >= 0 ? "text-chart-up-strong" : "text-chart-down-strong"
                    }`}
                  >
                    {Number.isFinite(change)
                      ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-app-ink-secondary">
                    {formatMoney(rotation?.moneyConfirmation ?? null)}
                  </td>
                  <td className="max-w-28 truncate px-3 py-2.5 text-app-ink-secondary">
                    {leader ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="rounded-full bg-app-surface px-2 py-1 text-[11px] text-app-ink-secondary">
                      {rotation?.phase ?? "数据不足"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                  {technicalByCode.get(row.code) &&
                  technicalByCode.get(row.code)!.quality !== "missing" &&
                  !technicalByCode.get(row.code)!.error ? (
                      <SignalCell
                        counts={technicalByCode.get(row.code)!.counts}
                        statusLabel={
                          rotation?.phase ??
                          (technicalByCode.get(row.code)!.counts.triggered > 0
                            ? "有触发"
                            : "中性观察")
                        }
                        keyLabel={technicalByCode.get(row.code)!.keySignals[0]}
                      />
                    ) : (
                      <span className="text-[10px] text-app-muted">
                      {technical.isLoading
                        ? "读取中"
                        : technicalByCode.get(row.code)?.error
                          ? "读取失败"
                          : "待生成"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-xs text-app-muted">{title}暂无快照</p>
      ) : null}
      {rows.length > 0 ? (
        <Pagination
          label={`${title}排行榜分页`}
          page={paged.page}
          pageCount={paged.totalPages}
          total={rows.length}
          rangeStart={paged.rangeStart}
          rangeEnd={paged.rangeEnd}
          tokens={paginationTokens(paged.page, paged.totalPages)}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
