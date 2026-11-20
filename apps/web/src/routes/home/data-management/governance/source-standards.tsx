import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  FileArchive,
  GitCommitHorizontal,
  GitCompareArrows,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { EmptyState } from "@preline-ui/EmptyState";
import { Skeleton } from "@preline-ui/Skeleton";
import { useSourceStandardStatus } from "../../../../hooks/useDataGovernance";
import { GovernanceSectionNav } from "./-private/GovernanceSectionNav";
import { GovernanceLinkButton } from "./-private/GovernanceLinkButton";
import { GovernanceStatusBadge } from "./-private/GovernanceStatusBadge";
import {
  formatGovernanceDate,
  readinessLabel,
  taskStatusMeta,
} from "./-private/governance-ui";

export const Route = createFileRoute(
  "/home/data-management/governance/source-standards",
)({
  component: SourceStandardsPage,
});

function SourceStandardsPage() {
  const { data, isLoading, error, refetch } = useSourceStandardStatus();
  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton height={40} />
        <Skeleton height={260} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (error) {
    return (
      <Card padding={6}>
        <EmptyState title="来源标准读取失败" description={error.message} />
        <div className="flex justify-center">
          <Button size="sm" onClick={() => void refetch()}>
            重新读取
          </Button>
        </div>
      </Card>
    );
  }

  const source = data?.items[0];
  if (!source) return null;
  const task = source.latestTask;
  const taskActive =
    task?.status === "pending" || task?.status === "in_progress";
  const detectedVersion =
    typeof task?.payloadJson.versionLabel === "string"
      ? task.payloadJson.versionLabel
      : null;
  const detectedCommit =
    typeof task?.payloadJson.commitSha === "string" ? task.payloadJson.commitSha : null;

  return (
    <div className="flex flex-col gap-4">
      <GovernanceSectionNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">来源标准</h2>
          <p className="mt-1 text-xs text-app-muted">
            Skill 只作为开发期来源规范；生产始终读取仓库 Provider 与代码注册表。
          </p>
        </div>
        <GovernanceStatusBadge
          label={`研究门禁 · ${readinessLabel(data?.gateMode)}`}
          tone={data?.gateMode === "enforce" ? "success" : "warning"}
        />
      </div>

      <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <Card padding={5} className="border-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-app-muted">
                Pinned baseline
              </p>
              <h3 className="mt-1 text-base font-semibold text-app-ink">
                a-stock-data v{source.versionLabel}
              </h3>
            </div>
            <GovernanceStatusBadge label="不可变快照" tone="success" />
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] text-app-muted">Commit</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-app-ink">
                {source.commitSha}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-app-muted">复核日期</dt>
              <dd className="mt-1 text-xs text-app-ink">
                {formatGovernanceDate(source.reviewedAt)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-app-muted">SKILL.md SHA-256</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-app-ink">
                {source.skillFileSha256}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] text-app-muted">仓库快照</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-app-ink">
                {source.snapshotPath}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-app-line pt-4">
            {source.capabilities.map((capability) => (
              <Badge key={capability} label={capability} variant="neutral" />
            ))}
          </div>
        </Card>

        <Card padding={5} className="border-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-app-muted">
                Drift review
              </p>
              <h3 className="mt-1 text-sm font-semibold text-app-ink">上游变化</h3>
            </div>
            <GitCompareArrows className="size-5 text-primary" />
          </div>
          {task && detectedVersion ? (
            <>
              <div className="mt-5 rounded-xl bg-app-surface/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-semibold text-app-ink">
                    v{detectedVersion}
                  </span>
                  <GovernanceStatusBadge
                    label={taskStatusMeta(task.status).label}
                    tone={taskStatusMeta(task.status).tone}
                  />
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-app-muted">
                  {detectedCommit ?? "commit 未记录"}
                </p>
                <p className="mt-2 text-xs text-app-muted">{task.title}</p>
              </div>
              {taskActive ? (
                <div className="mt-4">
                  <GovernanceLinkButton
                    href="/home/data-management/governance/review-tasks"
                    variant="primary"
                  >
                    打开审阅任务
                  </GovernanceLinkButton>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-xl bg-app-surface/60 p-4">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-app-success" />
                <p className="text-xs font-medium text-app-ink">已与固定基线一致</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-app-muted">
                最近巡检未发现 commit、版本标签或 checksum 变化。
              </p>
            </div>
          )}
        </Card>
      </section>

      <Card padding={5}>
        <h3 className="text-sm font-semibold text-app-ink">升级流程</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            {
              title: "检测",
              body: "每日比较 commit、版本和 SKILL checksum。",
              icon: GitCommitHorizontal,
            },
            {
              title: "建单",
              body: "同一 commit 只保留一个审阅任务。",
              icon: ShieldCheck,
            },
            {
              title: "评估",
              body: "核对端点、字段、限流、降级与兼容性。",
              icon: GitCompareArrows,
            },
            {
              title: "变更",
              body: "需要落地时单独创建 OpenSpec，不直接改生产。",
              icon: FileArchive,
            },
          ].map(({ title, body, icon: Icon }, index) => (
            <div key={title} className="rounded-xl bg-app-surface/45 p-4">
              <div className="flex items-center justify-between">
                <Icon className="size-4 text-primary" />
                <span className="font-mono text-[11px] text-app-muted">
                  0{index + 1}
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold text-app-ink">{title}</p>
              <p className="mt-1 text-[11px] leading-5 text-app-muted">{body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
