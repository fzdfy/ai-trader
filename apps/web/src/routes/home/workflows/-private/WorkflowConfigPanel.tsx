import { Settings2, Trash2, X } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { TextArea } from "@preline-ui/TextArea";
import { TextInput } from "@preline-ui/TextInput";
import { useSyncModules } from "../../../../hooks/useDataSync";
import { useStrategiesQuery } from "../../../../hooks/useStrategies";
import { WORKFLOW_NODE_META, type WorkflowCanvasNode } from "../../../../lib/workflows";

const SELECT_CLASS =
  "focus-ring h-9 w-full rounded-lg border border-app-line bg-app-panel px-3 text-sm text-app-ink";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function WorkflowConfigPanel({
  node,
  onChange,
  onClose,
  onDelete,
}: {
  node: WorkflowCanvasNode | null;
  onChange: (config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const syncModules = useSyncModules();
  const strategies = useStrategiesQuery();
  if (!node) return null;

  const config = node.config;
  const meta = WORKFLOW_NODE_META[node.type];
  const manualSymbols = asString(config.symbolsText).trim()
    ? asString(config.symbolsText)
        .split(/[\s,，]+/)
        .map((symbol) => symbol.trim())
        .filter(Boolean)
    : Array.isArray(config.symbols)
      ? (config.symbols as string[])
      : [];
  const uniqueManualSymbols = [...new Set(manualSymbols)];

  return (
    <aside
      id="workflow-config-panel"
      className="absolute inset-x-0 bottom-0 z-30 max-h-[74%] overflow-y-auto border-t border-app-line bg-app-panel shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[350px] lg:border-l lg:border-t-0"
      aria-label={`${meta.label}节点配置`}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-app-line bg-app-panel px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-app-surface text-app-muted">
            <Settings2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-app-ink">{meta.label}</p>
            <p className="mt-0.5 font-mono text-[10px] text-app-faint">{node.id}</p>
          </div>
        </div>
        <button
          type="button"
          className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
          aria-label="关闭节点配置"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {node.type === "trigger" ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-app-ink">触发方式</span>
              <select
                className={SELECT_CLASS}
                value={asString(config.type, "manual")}
                onChange={(event) => {
                  const type = event.currentTarget.value;
                  onChange(
                    type === "schedule"
                      ? { type, time: "15:10" }
                      : type === "sync_complete"
                        ? { type, jobType: "kline-1d" }
                        : { type: "manual" },
                  );
                }}
              >
                <option value="manual">手动触发</option>
                <option value="schedule">交易日定时</option>
                <option value="sync_complete">同步模块完成后</option>
              </select>
            </label>
            {config.type === "schedule" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-app-ink">执行时间</span>
                <input
                  type="time"
                  className={SELECT_CLASS}
                  value={asString(config.time, "15:10")}
                  onChange={(event) =>
                    onChange({ type: "schedule", time: event.currentTarget.value })
                  }
                />
                <span className="mt-1 block text-[11px] text-app-muted">
                  仅在交易日执行，时区为 Asia/Shanghai。
                </span>
              </label>
            ) : null}
            {config.type === "sync_complete" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-app-ink">同步模块</span>
                <select
                  className={SELECT_CLASS}
                  value={asString(config.jobType, "kline-1d")}
                  onChange={(event) =>
                    onChange({
                      type: "sync_complete",
                      jobType: event.currentTarget.value,
                    })
                  }
                >
                  {(syncModules.data?.modules ?? [])
                    .filter((module) => module.jobType !== "sync-manual")
                    .map((module) => (
                      <option key={module.jobType} value={module.jobType}>
                        {module.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        {node.type === "stock_pool" ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-app-ink">标的来源</span>
              <select
                className={SELECT_CLASS}
                value={asString(config.source, "watchlist")}
                onChange={(event) => {
                  const source = event.currentTarget.value;
                  onChange(
                    source === "manual" ? { source, symbols: [], symbolsText: "" } : { source },
                  );
                }}
              >
                <option value="watchlist">我的自选</option>
                <option value="stock_pool">当日落库选股池</option>
                <option value="manual">手动输入代码</option>
              </select>
            </label>
            {config.source === "manual" ? (
              <TextArea
                label="股票代码"
                description={`每行或用逗号分隔，最多 50 只。当前 ${uniqueManualSymbols.length} 只。`}
                value={asString(config.symbolsText, uniqueManualSymbols.join("\n"))}
                onChange={(value) => {
                  const symbols = [
                    ...new Set(
                      value
                        .split(/[\s,，]+/)
                        .map((symbol) => symbol.trim())
                        .filter(Boolean),
                    ),
                  ];
                  onChange({ source: "manual", symbols, symbolsText: value });
                }}
                placeholder={"600519.SH\n000001.SZ"}
              />
            ) : null}
            {uniqueManualSymbols.length > 50 ? (
              <p className="text-[11px] text-destructive">请输入不超过 50 只股票。</p>
            ) : null}
          </>
        ) : null}

        {node.type === "screen" ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-app-ink">选股策略</span>
              <select
                className={SELECT_CLASS}
                value={String(asNumber(config.strategyId))}
                onChange={(event) =>
                  onChange({
                    ...config,
                    strategyId: Number(event.currentTarget.value),
                  })
                }
              >
                <option value="0">选择策略</option>
                {(strategies.data ?? []).map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
            </label>
            <TextInput
              label="输出数量"
              type="number"
              min={1}
              max={500}
              value={String(asNumber(config.topN, 50))}
              onChange={(value) => onChange({ ...config, topN: Math.max(1, Number(value) || 50) })}
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-app-ink">股票池范围</span>
              <select
                className={SELECT_CLASS}
                value={asString(config.scope, "all")}
                onChange={(event) => onChange({ ...config, scope: event.currentTarget.value })}
              >
                <option value="all">全市场</option>
                <option value="industry">指定行业</option>
                <option value="concept">指定概念</option>
                <option value="gain3">今日涨幅 ≥ 3%</option>
                <option value="amount1b">成交额 ≥ 10 亿</option>
                <option value="limitUp1">百日涨停</option>
              </select>
            </label>
            {config.scope === "industry" || config.scope === "concept" ? (
              <TextInput
                label="板块代码"
                value={
                  Array.isArray(config.boardCodes) ? (config.boardCodes as string[]).join(", ") : ""
                }
                onChange={(value) =>
                  onChange({
                    ...config,
                    boardCodes: value
                      .split(/[\s,，]+/)
                      .map((code) => code.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="BK1027, BK1030"
              />
            ) : null}
          </>
        ) : null}

        {node.type === "backtest" ? (
          <>
            <TextInput
              label="回测策略"
              value={asString(config.strategy)}
              onChange={(value) => onChange({ ...config, strategy: value })}
              description="填写 quant 回测策略名，例如 ma_cross。"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-app-ink">开始日期</span>
                <input
                  type="date"
                  className={SELECT_CLASS}
                  value={asString(config.startDate)}
                  onChange={(event) =>
                    onChange({ ...config, startDate: event.currentTarget.value })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-app-ink">结束日期</span>
                <input
                  type="date"
                  className={SELECT_CLASS}
                  value={asString(config.endDate)}
                  onChange={(event) => onChange({ ...config, endDate: event.currentTarget.value })}
                />
              </label>
            </div>
            <p className="rounded-lg bg-app-surface px-3 py-2 text-[11px] leading-5 text-app-muted">
              回测只消费“标的”端口传入的股票列表，最多 50 只。
            </p>
          </>
        ) : null}

        {node.type === "review" ? (
          <p className="rounded-lg bg-app-surface px-3 py-2.5 text-xs leading-5 text-app-muted">
            使用当前应复盘交易日生成复盘，并在运行详情中保存复盘日期引用。
          </p>
        ) : null}

        {node.type === "factor_iterate" ? (
          <>
            <TextArea
              label="研究描述"
              value={asString(config.description)}
              onChange={(value) => onChange({ ...config, description: value })}
              placeholder="描述想寻找的因子逻辑、数据范围和市场假设"
            />
            <TextInput
              label="最多轮次"
              type="number"
              min={1}
              max={5}
              value={String(asNumber(config.rounds, 3))}
              onChange={(value) =>
                onChange({
                  ...config,
                  rounds: Math.min(5, Math.max(1, Number(value) || 3)),
                })
              }
            />
          </>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t border-app-line bg-app-panel p-4">
        <Button
          variant="secondary"
          className="w-full text-destructive"
          icon={<Trash2 className="size-4" />}
          onClick={onDelete}
        >
          删除节点
        </Button>
      </div>
    </aside>
  );
}
