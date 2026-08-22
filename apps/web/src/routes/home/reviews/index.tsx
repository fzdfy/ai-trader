import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home/reviews/")({
  loader: () => {
    throw redirect({ to: "/home/reviews/today" });
  },
});
