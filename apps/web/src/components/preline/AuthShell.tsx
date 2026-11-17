import type { ReactNode } from "react";
import { BarChart3, Bot, ShieldCheck } from "lucide-react";
import { BrandLogo } from "../BrandLogo";
import { useAppTheme } from "../AppThemeProvider";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthShell({ eyebrow, title, description, children }: AuthShellProps) {
  const { preset } = useAppTheme();

  return (
    <main className="preline-app grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.72fr)]">
      <section className="auth-hero relative hidden overflow-hidden p-10 lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <BrandLogo color={preset.accent} size={38} />
          <div>
            <p className="text-base font-semibold tracking-tight">Apollo Quant</p>
            <p className="mt-0.5 text-xs text-app-muted">智能研究与量化工作台</p>
          </div>
        </div>
        <div className="my-auto max-w-xl">
          <p className="text-xs font-medium text-primary">RESEARCH WITH EVIDENCE</p>
          <h1 className="mt-4 text-[clamp(36px,5vw,64px)] font-semibold leading-[1.05] tracking-[-0.05em]">
            把数据、研究与行动放进同一条证据链。
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-app-muted">
            行情、研报、复盘和量化任务在同一个工作台协同，让每次判断都能回到数据与过程。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: BarChart3, label: "实时数据" },
            { icon: Bot, label: "AI 研究" },
            { icon: ShieldCheck, label: "可追溯结论" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-xl border border-app-line bg-app-panel/70 p-3">
              <Icon className="size-4 text-primary" />
              <p className="mt-3 text-xs text-app-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[390px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandLogo color={preset.accent} size={34} />
            <span className="font-semibold text-app-ink">Apollo Quant</span>
          </div>
          <p className="text-xs font-medium text-primary">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-app-ink">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-app-muted">{description}</p>
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </main>
  );
}
