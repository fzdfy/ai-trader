export type AppRole = "user" | "super_admin";

export type SystemLink = {
  label: string;
  href: string;
  icon: "database" | "palette";
};

export type DataManagementSection = {
  label: string;
  href: string;
  icon: "overview" | "database" | "table" | "sync" | "quality" | "governance" | "audit";
  exact?: boolean;
};

const DATA_MANAGEMENT_LINK: SystemLink = {
  label: "数据管理",
  href: "/home/data-management",
  icon: "database",
};

const THEME_SETTINGS_LINK: SystemLink = {
  label: "主题设置",
  href: "/home/settings",
  icon: "palette",
};

export function canAccessDataManagement(role: unknown): boolean {
  return role === "super_admin";
}

const DATA_MANAGEMENT_SECTIONS: readonly DataManagementSection[] = [
  { label: "总览", href: "/home/data-management", icon: "overview", exact: true },
  { label: "数据源", href: "/home/data-management/sources", icon: "database" },
  { label: "数据表", href: "/home/data-management/tables", icon: "table" },
  { label: "数据同步", href: "/home/data-management/sync", icon: "sync" },
  { label: "数据质量", href: "/home/data-management/quality", icon: "quality" },
  {
    label: "数据治理",
    href: "/home/data-management/governance",
    icon: "governance",
  },
  { label: "操作审计", href: "/home/data-management/audit", icon: "audit" },
];

export function getDataManagementSectionsForRole(
  role: unknown,
): readonly DataManagementSection[] {
  return canAccessDataManagement(role) ? DATA_MANAGEMENT_SECTIONS : [];
}

export function getSystemLinksForRole(role: unknown): readonly SystemLink[] {
  return canAccessDataManagement(role)
    ? [DATA_MANAGEMENT_LINK, THEME_SETTINGS_LINK]
    : [THEME_SETTINGS_LINK];
}

export function getDataManagementViewState(
  role: unknown,
  isLoading: boolean,
): "loading" | "denied" | "allowed" {
  if (isLoading) return "loading";
  return canAccessDataManagement(role) ? "allowed" : "denied";
}

export function canRetryModule(
  status: string,
  reason: string,
  hasRunningJob: boolean,
): boolean {
  return status === "failed" && reason.trim().length > 0 && !hasRunningJob;
}

export function canRunManualSync(hasRunningJob: boolean): boolean {
  return !hasRunningJob;
}

export function getCapabilityRuntimeMeta(
  capability: {
    active_source: string | null;
    degraded: boolean;
    available: boolean;
  } | null,
): {
  label: string;
  variant: "success" | "warning" | "error" | "neutral";
} {
  if (!capability) return { label: "无运行态", variant: "neutral" };
  if (!capability.available) return { label: "全链不可用", variant: "error" };
  if (capability.degraded) {
    return {
      label: `已降级 → ${capability.active_source ?? "未知源"}`,
      variant: "warning",
    };
  }
  return {
    label: `主源正常 → ${capability.active_source ?? "未知源"}`,
    variant: "success",
  };
}
