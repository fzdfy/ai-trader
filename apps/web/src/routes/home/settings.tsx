import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@preline-ui/Stack";
import { Heading } from "@preline-ui/Heading";
import { ThemeSettings } from "./-private/ThemeSettings";

export const Route = createFileRoute("/home/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <VStack gap={4}>
      <Heading level={2}>主题设置</Heading>
      <ThemeSettings />
    </VStack>
  );
}
