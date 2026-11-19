import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home/data-center/$table")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/home/data-management/tables/$table",
      params: { table: params.table },
    });
  },
});
