import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home/sync")({
  beforeLoad: () => {
    throw redirect({ to: "/home/data-management/sync" });
  },
});
