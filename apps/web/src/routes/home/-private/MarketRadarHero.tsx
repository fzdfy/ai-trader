import type { Dispatch } from "react";
import type { MarketBriefResponse } from "../../../lib/market-brief";
import type {
  MarketSelectionAction,
  MarketSelectionState,
} from "../../../lib/market-selection";
import { AShareMarketBoard } from "./AShareMarketBoard";
import { ETFContextCard } from "./ETFContextCard";
import { GlobalContextCard } from "./GlobalContextCard";

export function MarketRadarHero({
  data,
  selection,
  dispatch,
}: {
  data: MarketBriefResponse;
  selection: MarketSelectionState;
  dispatch: Dispatch<MarketSelectionAction>;
}) {
  return (
    <section className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(300px,.78fr)]" aria-label="A 股与跨资产市场雷达">
      <AShareMarketBoard
        data={data}
        selectedSymbol={selection.symbol}
        range={selection.range}
        onSelectSymbol={(symbol) => dispatch({ type: "index", symbol })}
        onSelectRange={(range) => dispatch({ type: "range", domain: "index", range })}
      />
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
        <GlobalContextCard
          data={data}
          selectedSymbol={selection.globalSymbol}
          range={selection.globalRange}
          onSelectSymbol={(symbol) => dispatch({ type: "global", symbol })}
          onSelectRange={(range) => dispatch({ type: "range", domain: "global", range })}
        />
        <ETFContextCard
          data={data}
          selectedSymbol={selection.etfSymbol}
          range={selection.etfRange}
          onSelectSymbol={(symbol) => dispatch({ type: "etf", symbol })}
          onSelectRange={(range) => dispatch({ type: "range", domain: "etf", range })}
          onTabKeyDown={(key) => dispatch({ type: "etf-key", key })}
        />
      </aside>
    </section>
  );
}
