import { HStack } from "@astryxdesign/core/Stack";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Info, Play } from "lucide-react";

interface DefinitionTestBarProps {
  /** 测试请求进行中 */
  isPending: boolean;
  /** 无可测试内容（定义为空）时禁用按钮 */
  isDisabled: boolean;
  onTest: () => void;
}

/** 运行校验使用的样本与周期（hover 提示，与 quant 侧 SAMPLE_* 常量一致） */
const TEST_SAMPLE_HINT =
  "运行校验用本地真实日线试跑：3 只非北交所标的、最近 251 根日线；实跑通过后才能保存。";

/**
 * 因子定义（表达式 / Python 代码）编辑框右上角的「测试」操作组。
 *
 * 内容可能是从别处复制粘贴而来，与 AI 生成路径不同、不保证合法，
 * 故必须测试通过后才能保存；测试结果由编辑框下方的状态行展示。
 */
export function DefinitionTestBar({ isPending, isDisabled, onTest }: DefinitionTestBarProps) {
  return (
    <HStack gap={1} align="center">
      <Button
        label="测试"
        size="sm"
        variant="secondary"
        icon={<Play size={14} />}
        isLoading={isPending}
        isDisabled={isDisabled || isPending}
        tooltip={isDisabled ? "请先填写内容" : "校验通过后才能保存"}
        onClick={onTest}
      />
      <IconButton
        label="测试样本与周期说明"
        icon={<Info size={14} />}
        variant="ghost"
        size="sm"
        tooltip={TEST_SAMPLE_HINT}
      />
    </HStack>
  );
}
