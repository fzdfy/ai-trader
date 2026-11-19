import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GOVERNANCE_ASSETS } from "./registry.ts";

export function generatedCatalog(): string {
  const rows = [...GOVERNANCE_ASSETS]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(
      (asset) =>
        `| \`${asset.key}\` | ${asset.name} | ${asset.domain} | ${asset.tier} | ${asset.responsibilities.owner.name} | ${asset.responsibilities.steward.name} | ${asset.sourceStandardRefs.join(", ") || "—"} | ${asset.classification} | ${asset.retention.mode} |`,
    );
  return [
    "# 数据治理资产目录",
    "",
    "> 此文件由治理注册表自动生成，请勿手工编辑。",
    "",
    `资产总数：${GOVERNANCE_ASSETS.length}`,
    "",
    "| 资产 | 名称 | 数据域 | Tier | Data Owner | Data Steward | Source Standard | 分类 | 保留 |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../docs/data-governance/catalog.md",
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, generatedCatalog());
  console.log(outputPath);
}
