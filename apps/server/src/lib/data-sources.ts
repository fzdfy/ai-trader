const SOURCE_PROVIDER: Record<string, string> = {
  东方财富: "eastmoney",
  腾讯: "tencent",
  同花顺: "ths",
  通达信: "mootdx",
  新浪: "sina",
  百度: "baidu",
  巨潮资讯: "cninfo",
};

export function getSourceProviderName(platform: string): string | null {
  return SOURCE_PROVIDER[platform] ?? null;
}
