import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Avatar } from "@astryxdesign/core/Avatar";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { authClient } from "../lib/auth-client";
import { useUploadAvatar } from "../hooks/useProfile";

interface ProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  image?: string | null;
}

/**
 * 编辑资料弹框：修改头像（上传图片）和用户名。
 * 头像走后端上传接口拿到 URL，再通过 better-auth 的 updateUser 持久化并刷新会话。
 */
export function ProfileDialog({ isOpen, onOpenChange, name, image }: ProfileDialogProps) {
  const [username, setUsername] = useState(name);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const uploadAvatar = useUploadAvatar();

  // 打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setUsername(name);
      setFile(null);
      setPreview(null);
      setError("");
    }
  }, [isOpen, name]);

  // 选择文件后生成本地预览
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSave = async () => {
    if (!username.trim()) return;
    setError("");

    // 有新头像时先上传，拿到 URL；否则保留原头像
    let imageUrl = image ?? null;
    if (file) {
      imageUrl = (await uploadAvatar.mutateAsync(file)).url;
    }

    const { error: updateError } = await authClient.updateUser({
      name: username.trim(),
      image: imageUrl,
    });

    if (updateError) {
      setError(updateError.message ?? "保存失败");
      return;
    }
    onOpenChange(false);
  };

  const displayImage = preview ?? image ?? undefined;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={480} maxHeight="85vh">
      <Layout
        header={<DialogHeader title="编辑资料" subtitle="修改头像和用户名" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={5}>
              <HStack gap={4} align="center">
                <Avatar src={displayImage} name={username} size={96} />
                <VStack gap={2} style={{ flex: 1 }}>
                  <Text size="sm" weight="semibold">
                    头像
                  </Text>
                  <FileInput
                    label="上传头像"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    maxSize={2 * 1024 * 1024}
                    value={file}
                    onChange={(f) => setFile(Array.isArray(f) ? (f[0] ?? null) : f)}
                    placeholder="点击选择图片"
                  />
                </VStack>
              </HStack>

              <TextInput
                label="用户名"
                value={username}
                onChange={setUsername}
                placeholder="请输入用户名"
              />

              {error && (
                <Text type="supporting" style={{ color: "var(--color-error)" }}>
                  {error}
                </Text>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} align="center" style={{ justifyContent: "flex-end" }}>
              <Button label="取消" variant="ghost" onClick={() => onOpenChange(false)} />
              <Button
                label="保存"
                variant="primary"
                isDisabled={!username.trim() || uploadAvatar.isPending}
                isLoading={uploadAvatar.isPending}
                onClick={handleSave}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
