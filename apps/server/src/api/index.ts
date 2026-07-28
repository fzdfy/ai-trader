import { Hono } from "hono";
import { instrumentsRoute } from "./instruments";
import { boardsRoute } from "./boards";
import { watchlistRoute } from "./watchlist";
import { quotesRoute } from "./quotes";
import { klineRoute } from "./kline";
import { featuresRoute } from "./features";
import { signalsRoute } from "./signals";
import { newsRoute } from "./news";
import { backtestsRoute } from "./backtests";
import { askRoute } from "./ask";
// import { adminRoute } from "./admin";

const api = new Hono();
api.route("/instruments", instrumentsRoute);
api.route("/boards", boardsRoute);
api.route("/watchlist", watchlistRoute);
api.route("/kline", klineRoute);
api.route("/backtests", backtestsRoute);
// api.route("/signals", signalsRoute);
// api.route("/news", newsRoute);
// api.route("/backtests", backtestsRoute);
// api.route("/ask", askRoute);
// api.route("/admin", adminRoute);

export { api };
