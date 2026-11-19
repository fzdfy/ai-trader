import { createFileRoute } from "@tanstack/react-router";
import { DataTableDetailView } from "../../-private/DataTableDetail";

export const Route = createFileRoute("/home/data-management/tables/$table")({
  component: TableDetailPage,
});

function TableDetailPage() {
  const { table } = Route.useParams();
  return <DataTableDetailView table={table} />;
}
