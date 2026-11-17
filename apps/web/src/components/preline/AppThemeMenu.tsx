import { Monitor, Moon, Sun } from "lucide-react";
import { useAppTheme } from "../AppThemeProvider";
import type { AppThemeMode } from "../../lib/app-theme";

const MODE_OPTIONS: Array<{
  mode: AppThemeMode;
  label: string;
  icon: typeof Sun;
}> = [
  { mode: "light", label: "浅色", icon: Sun },
  { mode: "dark", label: "深色", icon: Moon },
  { mode: "system", label: "跟随系统", icon: Monitor },
];

export function AppThemeMenu() {
  const { mode, setMode } = useAppTheme();
  const CurrentIcon = MODE_OPTIONS.find((item) => item.mode === mode)?.icon ?? Monitor;

  return (
    <div className="hs-dropdown relative inline-flex">
      <button
        type="button"
        className="hs-dropdown-toggle focus-ring grid size-9 place-items-center rounded-full border border-app-line bg-app-panel text-app-muted transition hover:border-app-line-strong hover:text-app-ink"
        aria-label="切换主题"
      >
        <CurrentIcon className="size-4" />
      </button>
      <div className="hs-dropdown-menu invisible absolute right-0 top-11 z-50 w-36 translate-y-1 rounded-xl border border-app-line bg-app-panel p-1.5 opacity-0 shadow-xl transition-[opacity,transform] duration-150 hs-dropdown-open:visible hs-dropdown-open:translate-y-0 hs-dropdown-open:opacity-100">
        {MODE_OPTIONS.map(({ mode: option, label, icon: Icon }) => (
          <button
            key={option}
            type="button"
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
              mode === option
                ? "bg-primary/10 font-medium text-primary"
                : "text-app-muted hover:bg-app-surface hover:text-app-ink"
            }`}
            onClick={() => setMode(option)}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
