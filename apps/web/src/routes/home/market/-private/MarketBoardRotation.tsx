import { useState } from "react";
import { Pagination } from "@preline-ui/Pagination";
import type { MarketRotationResponse, MarketRotationRow } from "../../../../lib/market-center";
import {
  formatMoney,
  formatRankChange,
  formatRotationValue,
  paginateRows,
  paginationTokens,
  rotationQualityLabel,
  rotationStateTone,
  selectRotationQuadrantRows,
} from "../../../../lib/market-center";

const quadrantGroups: Array<{
  title: string;
  phases: MarketRotationRow["phase"][];
}> = [
  { title: "领先 · 加速", phases: ["加速"] },
  { title: "领先 · 放缓", phases: ["放缓", "扩散"] },
  { title: "落后 · 修复", phases: ["修复"] },
  { title: "落后 · 退潮", phases: ["退潮", "稳定"] },
];

export function MarketBoardRotation({
  type,
  data,
  onOpen,
}: {
  type: "industry" | "concept";
  data: MarketRotationResponse;
  onOpen: (code: string) => void;
}) {
  const [page, setPage] = useState(1);
  const rankedRows = data.rows.filter((row) => row.rank != null);
  const paged = paginateRows(rankedRows, page);
  return (
    <div>
      <div className="grid xl:grid-cols-[minmax(230px,.72fr)_minmax(0,1.28fr)]">
        <div className="grid auto-rows-[152px] gap-2 border-b border-app-line px-3 py-2 xl:h-full xl:min-h-[536px] xl:auto-rows-fr xl:overflow-hidden xl:border-r xl:border-b-0">
          {quadrantGroups.map((group) => {
            const items = selectRotationQuadrantRows(data.rows, group.phases);
            return (
              <div
                key={group.title}
                className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-app-surface/60 p-2"
              >
                <span className="text-[10px] font-medium text-app-muted">{group.title}</span>
                {items.length ? (
                  <ul className="mt-1 grid min-h-0 flex-1 grid-rows-3 gap-0.5">
                    {items.map((item) => (
                      <li key={item.code} className="min-h-0">
                        <button
                          type="button"
                          className="focus-ring flex h-full min-h-0 w-full flex-col justify-center rounded-md px-2 text-left transition-colors hover:bg-app-panel focus-visible:bg-app-panel"
                          aria-label={`查看 ${item.name}，相对收益 ${formatRotationValue(item.relativeReturn)}，排名 ${item.rank ?? "—"}，排名变化 ${formatRankChange(item.rankChange)}，主力确认 ${formatMoney(item.moneyConfirmation)}`}
                          title={`${item.name} · 排名 ${item.rank ?? "—"} · 变化 ${formatRankChange(item.rankChange)} · 主力 ${formatMoney(item.moneyConfirmation)}`}
                          onClick={() => onOpen(item.code)}
                        >
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <strong className="min-w-0 truncate text-[11px] leading-4 text-app-ink">
                              {item.name}
                            </strong>
                            <span className={`shrink-0 font-mono text-[10px] font-semibold ${
                              (item.relativeReturn ?? 0) >= 0
                                ? "text-chart-up-strong"
                                : "text-chart-down-strong"
                            }`}>
                              {formatRotationValue(item.relativeReturn)}
                            </span>
                          </span>
                          <span className="grid grid-cols-[.8fr_1fr_1.2fr] gap-1 font-mono text-[9px] leading-[10px] text-app-muted">
                            <span className="truncate">
                              <span className="font-sans">排名</span> {item.rank ?? "—"}
                            </span>
                            <span className="truncate text-center">
                              <span className="font-sans">变化</span> {formatRankChange(item.rankChange)}
                            </span>
                            <span className="truncate text-right">
                              <span className="font-sans">主力</span> {formatMoney(item.moneyConfirmation)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="mt-3 block text-[11px] text-app-muted">暂无</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] table-fixed border-collapse text-xs">
              <thead>
                <tr className="bg-app-surface/55 text-left text-[11px] text-app-muted">
                  <th className="w-[34%] px-1.5 py-2 font-medium">板块</th>
                  <th className="w-[20%] px-1.5 py-2 text-right font-medium">
                    {data.window.replace("D", " 日")} 相对
                  </th>
                  <th className="w-[18%] px-1.5 py-2 text-right font-medium">排名变化</th>
                  <th className="w-[16%] px-1.5 py-2 text-right font-medium">主力确认</th>
                  <th className="w-[12%] px-1.5 py-2 text-right font-medium">阶段</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((row) => {
                  const tone = rotationStateTone(row.phase);
                  return (
                    <tr
                      key={row.code}
                      className="focus-ring cursor-pointer border-t border-app-line/60 hover:bg-primary/5"
                      role="link"
                      tabIndex={0}
                      aria-label={`查看 ${row.name} 轮动详情`}
                      onClick={() => onOpen(row.code)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onOpen(row.code);
                      }}
                    >
                      <td className="min-w-0 px-1.5 py-1.5">
                        <strong className="block truncate text-xs text-app-ink">{row.name}</strong>
                        <span className="mt-0.5 block font-mono text-[11px] text-app-muted">{row.code}</span>
                      </td>
                      <td className={`px-1.5 py-1.5 text-right font-mono font-semibold ${
                        (row.relativeReturn ?? 0) >= 0 ? "text-chart-up-strong" : "text-chart-down-strong"
                      }`}>
                        {formatRotationValue(row.relativeReturn)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right font-mono text-app-ink-secondary">
                        {row.rank}
                        {row.rankChange == null ? "" : ` / ${formatRankChange(row.rankChange)}`}
                      </td>
                      <td className="px-1.5 py-1.5 text-right font-mono text-app-ink-secondary">
                        {formatMoney(row.moneyConfirmation)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right">
                        <span className={`inline-block max-w-full truncate rounded-full px-1.5 py-1 text-[10px] font-semibold ${
                          tone === "up"
                            ? "bg-chart-up/10 text-chart-up-strong"
                            : tone === "down"
                              ? "bg-chart-down/10 text-chart-down-strong"
                              : "bg-app-surface text-app-muted"
                        }`}>
                          {row.phase}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rankedRows.length > 0 ? (
            <Pagination
              label={`${type === "industry" ? "行业" : "概念"}轮动分页`}
              page={paged.page}
              pageCount={paged.totalPages}
              total={rankedRows.length}
              rangeStart={paged.rangeStart}
              rangeEnd={paged.rangeEnd}
              tokens={paginationTokens(paged.page, paged.totalPages)}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      </div>
      <p className="border-t border-app-line px-4 py-2.5 text-[11px] text-app-muted">
        {type === "industry" ? "行业" : "概念"}轮动 ·{" "}
        {rotationQualityLabel(data.status)} · {data.asOf?.slice(0, 10) ?? "暂无快照"}
      </p>
    </div>
  );
}
