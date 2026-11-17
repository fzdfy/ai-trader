import { Dialog, DialogHeader } from "@preline-ui/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@preline-ui/Layout";
import { Button } from "@preline-ui/Button";
import { VStack, HStack } from "@preline-ui/Stack";
import { Text } from "@preline-ui/Text";

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  isLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * 删除二次确认弹框：展示标题与说明，需用户显式点击「删除」。
 */
export function ConfirmDeleteDialog({
  isOpen,
  title,
  message,
  isLoading,
  onOpenChange,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="required" width={420}>
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={2}>
              <Text>{message ?? "删除后不可恢复，是否确认？"}</Text>
              <Text type="supporting" size="sm">
                该操作不可撤销
              </Text>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
              <Button label="取消" variant="ghost" onClick={() => onOpenChange(false)} />
              <Button
                label="删除"
                variant="destructive"
                isLoading={isLoading}
                onClick={onConfirm}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
