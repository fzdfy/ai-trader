import { createFileRoute, useParams } from "@tanstack/react-router";
import { DataTableDetailView } from "../-private/DataTableDetail";

export const Route = createFileRoute("/home/data-center/$table")({
  component: DataCenterDetailPage,
});

function DataCenterDetailPage() {
  const { table } = useParams({ from: "/home/data-center/$table" });
  return <DataTableDetailView table={table} />;
}
