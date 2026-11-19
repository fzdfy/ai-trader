import { Link, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  CircleAlert,
  ListChecks,
  Radar,
  ShieldCheck,
} from "lucide-react";

const ITEMS = [
  {
    label: "总览",
    href: "/home/data-management/governance",
    icon: ShieldCheck,
    exact: true,
  },
  {
    label: "资产与契约",
    href: "/home/data-management/governance/assets",
    icon: Boxes,
    exact: false,
  },
  {
    label: "质量证据",
    href: "/home/data-management/governance/quality",
    icon: Activity,
    exact: false,
  },
  {
    label: "来源标准",
    href: "/home/data-management/governance/source-standards",
    icon: Radar,
    exact: false,
  },
  {
    label: "治理任务",
    href: "/home/data-management/governance/work-tasks",
    icon: ListChecks,
    exact: false,
  },
  {
    label: "数据事故",
    href: "/home/data-management/governance/incidents",
    icon: CircleAlert,
    exact: false,
  },
] as const;

export function GovernanceSectionNav() {
  const location = useLocation();
  return (
    <nav
      aria-label="数据治理页面导航"
      className="flex flex-wrap gap-1 rounded-xl border border-app-line bg-app-panel p-1.5"
    >
      {ITEMS.map(({ label, href, icon: Icon, exact }) => {
        const selected = exact
          ? location.pathname === href || location.pathname === `${href}/`
          : location.pathname === href ||
            location.pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            to={href as "/home/data-management/governance"}
            activeOptions={{ exact }}
            className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition ${
              selected
                ? "bg-primary text-primary-foreground"
                : "text-app-muted hover:bg-app-surface hover:text-app-ink"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
