import { createFileRoute } from "@tanstack/react-router";
import { DailyDashboard } from "./-private/DailyDashboard";

export const Route = createFileRoute("/home/")({
  component: DailyDashboard,
});
