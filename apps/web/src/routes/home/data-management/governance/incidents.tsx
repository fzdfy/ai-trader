import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Dialog, DialogHeader } from "@preline-ui/Dialog";
import { EmptyState } from "@preline-ui/EmptyState";
import { Selector } from "@preline-ui/Selector";
import { Skeleton } from "@preline-ui/Skeleton";
import { Table, proportional } from "@preline-ui/Table";
import { TextArea } from "@preline-ui/TextArea";
import {
  useDataIncident,
  useDataIncidents,
  useTransitionIncident,
  type DataIncident,
} from "../../../../hooks/useDataGovernance";
import { GovernanceSectionNav } from "./-private/GovernanceSectionNav";
import { GovernanceStatusBadge } from "./-private/GovernanceStatusBadge";
import { formatGovernanceDate, incidentStatusMeta } from "./-private/governance-ui";

export const Route = createFileRoute(
  "/home/data-management/governance/incidents",
)({
  component: GovernanceIncidentsPage,
});

type IncidentRow = DataIncident & Record<string, unknown>;
type IncidentAction = "acknowledge" | "resolve";

const INCIDENT_COLUMNS = [
  {
    key: "title",
    header: "事故",
    width: proportional(1.7),
    renderCell: (row: IncidentRow) => (
      <div>
        <p className="text-xs font-medium text-app-ink">{row.title}</p>
        <p className="mt-0.5 text-[11px] text-app-muted">{row.description}</p>
      </div>
    ),
  },
  {
    key: "assetKey",
    header: "资产",
    width: proportional(0.8),
    renderCell: (row: IncidentRow) => (
      <span className="font-mono text-[11px]">{row.assetKey ?? "平台"}</span>
    ),
  },
  {
    key: "severity",
    header: "严重度",
    width: proportional(0.55),
    renderCell: (row: IncidentRow) => (
      <GovernanceStatusBadge
        label={row.severity}
        tone={row.severity === "critical" ? "error" : "warning"}
      />
    ),
  },
  {
    key: "status",
    header: "状态",
    width: proportional(0.65),
    renderCell: (row: IncidentRow) => {
      const status = incidentStatusMeta(row.status);
      return <GovernanceStatusBadge label={status.label} tone={status.tone} />;
    },
  },
  {
    key: "openedAt",
    header: "开始时间",
    width: proportional(0.8),
    renderCell: (row: IncidentRow) => formatGovernanceDate(row.openedAt),
  },
];

function GovernanceIncidentsPage() {
  const [status, setStatus] = useState("");
  const incidents = useDataIncidents({ status });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useDataIncident(selectedId);
  const transition = useTransitionIncident();
  const [action, setAction] = useState<IncidentAction | null>(null);
  const [reason, setReason] = useState("");
  const [rootCause, setRootCause] = useState("");

  const openAction = (next: IncidentAction) => {
    setReason("");
    setRootCause("");
    setAction(next);
  };

  const submitAction = async () => {
    if (!selectedId || !action || !reason.trim()) return;
    await transition.mutateAsync({
      id: selectedId,
      action,
      reason: reason.trim(),
      ...(rootCause.trim() ? { rootCause: rootCause.trim() } : {}),
    });
    setAction(null);
    setReason("");
    setRootCause("");
  };

  if (incidents.isLoading && !incidents.data) {
    return (
      <div className="space-y-3">
        <Skeleton height={40} />
        <Skeleton height={360} />
      </div>
    );
  }
  if (incidents.error) {
    return (
      <Card padding={6}>
        <EmptyState title="数据事故读取失败" description={incidents.error.message} />
        <div className="flex justify-center">
          <Button size="sm" onClick={() => void incidents.refetch()}>
            重新读取
          </Button>
        </div>
      </Card>
    );
  }

  const items = (incidents.data ?? []) as IncidentRow[];
  const incident = detail.data?.incident;
  return (
    <div className="flex flex-col gap-4">
      <GovernanceSectionNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">数据事故</h2>
          <p className="mt-1 text-xs text-app-muted">
            事故与状态变化只追加，不提供删除；严重未解决事故参与研究门禁。
          </p>
        </div>
        <Selector
          label="状态"
          aria-label="筛选事故状态"
          width={160}
          value={status}
          onChange={setStatus}
          placeholder="全部状态"
          options={[
            { value: "open", label: "待确认" },
            { value: "acknowledged", label: "已确认" },
            { value: "resolving", label: "处理中" },
            { value: "resolved", label: "已解决" },
            { value: "closed", label: "已关闭" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <Card padding={4}>
          <EmptyState
            title="没有匹配的数据事故"
            description="严重质量失败会按资产幂等创建或更新事故。"
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-app-line bg-app-panel">
          <Table<IncidentRow>
            idKey="id"
            columns={INCIDENT_COLUMNS as never}
            data={items}
            density="compact"
            dividers="rows"
            hasHover
          />
          <div className="flex flex-wrap gap-2 border-t border-app-line p-3">
            {items.slice(0, 8).map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={selectedId === item.id ? "primary" : "secondary"}
                onClick={() => setSelectedId(item.id)}
              >
                #{item.id} {incidentStatusMeta(item.status).label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {selectedId ? (
        <Card padding={5}>
          {detail.isLoading && !incident ? <Skeleton height={220} /> : null}
          {detail.error ? (
            <EmptyState title="事故详情读取失败" description={detail.error.message} />
          ) : null}
          {incident && detail.data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-app-ink">{incident.title}</h3>
                    <GovernanceStatusBadge
                      label={incidentStatusMeta(incident.status).label}
                      tone={incidentStatusMeta(incident.status).tone}
                    />
                    <GovernanceStatusBadge
                      label={incident.severity}
                      tone={incident.severity === "critical" ? "error" : "warning"}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-app-muted">
                    #{incident.id} · {incident.assetKey ?? "平台"} · 开始于{" "}
                    {formatGovernanceDate(incident.openedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {incident.status === "open" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<ShieldCheck className="size-3.5" />}
                      onClick={() => openAction("acknowledge")}
                    >
                      确认事故
                    </Button>
                  ) : null}
                  {["open", "acknowledged", "resolving"].includes(incident.status) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<CheckCircle2 className="size-3.5" />}
                      onClick={() => openAction("resolve")}
                    >
                      标记解决
                    </Button>
                  ) : null}
                </div>
              </div>

              <p className="text-xs leading-5 text-app-muted">{incident.description}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] text-app-muted">事故证据</p>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-app-surface/60 p-3 font-mono text-[11px] leading-5 text-app-ink">
                    {JSON.stringify(incident.payloadJson, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[11px] text-app-muted">处理历史</p>
                  <div className="mt-2 space-y-2">
                    {detail.data.events.map((event) => (
                      <div
                        key={event.id}
                        className="border-b border-app-line pb-2 last:border-0"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-app-ink">{event.eventType}</span>
                          <span className="text-app-muted">
                            {formatGovernanceDate(event.createdAt)}
                          </span>
                        </div>
                        {event.message ? (
                          <p className="mt-1 text-[11px] text-app-muted">{event.message}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {incident.rootCause ? (
                <p className="rounded-lg bg-app-warning-soft px-3 py-2 text-xs text-app-ink">
                  根因：{incident.rootCause}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : (
        <Card padding={4} className="border-dashed">
          <div className="flex items-center justify-center gap-2 text-xs text-app-muted">
            <CircleAlert className="size-4" />
            选择事故查看证据并执行状态流转
          </div>
        </Card>
      )}

      <Dialog isOpen={action !== null} onOpenChange={() => setAction(null)} width={500}>
        <DialogHeader
          title={action === "acknowledge" ? "确认数据事故" : "解决数据事故"}
          subtitle="原因与根因会写入事故事件和管理审计。"
          onOpenChange={() => setAction(null)}
        />
        <div className="space-y-4 p-5">
          <TextArea
            label="操作原因"
            value={reason}
            onChange={setReason}
            placeholder="说明当前判断、影响范围或恢复依据"
            maxLength={500}
          />
          {action === "resolve" ? (
            <TextArea
              label="根因（可选）"
              value={rootCause}
              onChange={setRootCause}
              placeholder="记录导致事故的根因"
              maxLength={1000}
            />
          ) : null}
          {transition.error ? (
            <p className="text-xs text-destructive">{transition.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              isLoading={transition.isPending}
              isDisabled={!reason.trim()}
              onClick={() => void submitAction()}
            >
              确认
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
