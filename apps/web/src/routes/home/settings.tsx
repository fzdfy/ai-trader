import { createFileRoute } from "@tanstack/react-router";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Heading";
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
