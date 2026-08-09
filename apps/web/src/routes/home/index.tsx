import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home/")({
  // loader: () => {
  //   throw redirect({ to: "/home/market/boards" });
  // },
});
