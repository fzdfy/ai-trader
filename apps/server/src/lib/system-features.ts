export interface SystemFeatures {
  dashboardMarketRadar: boolean;
  marketCenter: boolean;
}

export function getSystemFeatures(
  env: Record<string, string | undefined> = process.env,
): SystemFeatures {
  return {
    dashboardMarketRadar: env.DASHBOARD_MARKET_RADAR_ENABLED === "true",
    marketCenter: env.MARKET_CENTER_ENABLED === "true",
  };
}
