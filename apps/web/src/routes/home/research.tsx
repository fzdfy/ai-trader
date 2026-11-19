import { createFileRoute } from "@tanstack/react-router";
import { UnderConstructionPage } from "../../components/UnderConstructionPage";

export const Route = createFileRoute("/home/research")({
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <UnderConstructionPage
      title="研报洞察"
      description="聚合研报观点、行业判断和可追踪的研究线索。"
    />
  );
}
