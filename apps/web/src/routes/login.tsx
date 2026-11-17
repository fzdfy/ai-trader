import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { AuthShell } from "../components/preline/AuthShell";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const INPUT_CLASS =
  "focus-ring mt-1.5 w-full rounded-xl border border-app-line bg-app-panel px-3.5 py-2.5 text-sm text-app-ink placeholder:text-app-faint";

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    if (!email || !password) return;
    setIsLoading(true);
    setError("");
    const { error: signInError } = await authClient.signIn.email({ email, password });
    setIsLoading(false);
    if (signInError) {
      setError(signInError.message ?? "登录失败");
      return;
    }
    await navigate({ to: "/home" });
  };

  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="回到研究工作台"
      description="登录后继续查看行情、复盘和量化任务。"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSignIn();
        }}
      >
        <label className="block text-xs font-medium text-app-ink">
          邮箱
          <input
            className={INPUT_CLASS}
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-app-ink">
          密码
          <input
            className={INPUT_CLASS}
            type="password"
            autoComplete="current-password"
            placeholder="输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!email || !password || isLoading}
          className="auth-primary-button focus-ring flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {isLoading ? "登录中" : "登录"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-app-muted">
        没有账户？
        <Link to="/signup" className="ml-1 font-medium text-primary hover:underline">
          创建账户
        </Link>
      </p>
    </AuthShell>
  );
}
