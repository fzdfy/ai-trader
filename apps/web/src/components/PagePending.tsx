import { VStack } from "@astryxdesign/core/Stack";
import { Skeleton } from "@astryxdesign/core/Skeleton";

/** 页面加载骨架屏，模拟标题 + 内容区布局 */
export function PagePending() {
  return (
    <VStack gap={3} style={{ padding: "var(--spacing-6)" }}>
      {/* 标题行 */}
      <Skeleton height={28} width="35%" radius={2} index={0} />

      {/* 内容块 */}
      <VStack gap={2}>
        <Skeleton height={14} width="100%" radius={1} index={1} />
        <Skeleton height={14} width="92%" radius={1} index={2} />
        <Skeleton height={14} width="78%" radius={1} index={3} />
      </VStack>

      {/* 卡片区域 */}
      <Skeleton height={200} width="100%" radius={3} index={4} />
    </VStack>
  );
}
