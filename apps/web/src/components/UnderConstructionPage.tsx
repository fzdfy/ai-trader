import { Construction } from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";

export function UnderConstructionPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 pb-8">
      <header>
        <Badge variant="soft">开发中</Badge>
        <Heading level={1} className="mt-3 text-2xl md:text-[30px]">
          {title}
        </Heading>
        <Text as="p" type="supporting" className="mt-1.5 max-w-2xl">
          {description}
        </Text>
      </header>

      <Card className="grid min-h-[360px] place-items-center px-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="size-5" />
          </span>
          <Heading level={2} className="mt-4">
            正在开发中
          </Heading>
          <Text as="p" type="supporting" className="mt-2">
            页面结构、数据和交互将在后续版本中提供。
          </Text>
        </div>
      </Card>
    </div>
  );
}
