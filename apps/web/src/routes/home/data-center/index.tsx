import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home/data-center/")({
  beforeLoad: () => {
    throw redirect({ to: "/home/data-management/tables" });
  },
});
