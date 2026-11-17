export const WORKBENCH_ACTION_LINKS = [
  {
    title: "生成今日复盘",
    description: "聚合主线、资金与市场情绪",
    href: "/home/reviews/today",
  },
  {
    title: "迭代因子",
    description: "根据近期表现生成改进建议",
    href: "/home/factors/iterate",
  },
  {
    title: "运行选股任务",
    description: "按当前策略筛选候选池",
    href: "/home/screens",
  },
  {
    title: "发起回测",
    description: "验证策略在历史区间中的表现",
    href: "/home/backtest",
  },
] as const;

export function isDrawerDismissKey(key: string): boolean {
  return key === "Escape";
}
