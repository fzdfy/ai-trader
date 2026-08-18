import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { VStack, HStack } from "@astryxdesign/core/Stack";

interface FactorCreateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; description: string }) => void;
}

/**
 * 创建因子弹框：name + description 两个字段。
 */
export function FactorCreateDialog({ isOpen, onOpenChange, onSubmit }: FactorCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // 每次打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={480}>
      <Layout
        header={<DialogHeader title="创建因子" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="名称"
                value={name}
                onChange={setName}
                isRequired
                placeholder="如：乖离率"
                hasAutoFocus
              />
              <TextArea
                label="描述"
                value={description}
                onChange={setDescription}
                placeholder="简要说明该因子的含义与用途"
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
              <Button label="取消" variant="ghost" onClick={() => onOpenChange(false)} />
              <Button label="创建" variant="primary" isDisabled={!name.trim()} onClick={handleSubmit} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
