import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { AuthShell } from "../components/preline/AuthShell";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
});

const INPUT_CLASS =
  "focus-ring mt-1.5 w-full rounded-xl border border-app-line bg-app-panel px-3.5 py-2.5 text-sm text-app-ink placeholder:text-app-faint";

function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async () => {
    if (!name || !email || password.length < 8) return;
    setIsLoading(true);
    setError("");
    const { error: signUpError } = await authClient.signUp.email({ name, email, password });
    setIsLoading(false);
    if (signUpError) {
      setError(signUpError.message ?? "注册失败");
      return;
    }
    await navigate({ to: "/home" });
  };

  return (
    <AuthShell
      eyebrow="CREATE YOUR WORKSPACE"
      title="建立你的研究账户"
      description="从行情、研报和量化任务开始，形成自己的研究工作流。"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSignUp();
        }}
      >
        <label className="block text-xs font-medium text-app-ink">
          用户名
          <input
            className={INPUT_CLASS}
            autoComplete="name"
            placeholder="你的名字"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
            autoComplete="new-password"
            placeholder="至少 8 位"
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
          disabled={!name || !email || password.length < 8 || isLoading}
          className="auth-primary-button focus-ring flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {isLoading ? "创建中" : "创建账户"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-app-muted">
        已有账户？
        <Link to="/login" className="ml-1 font-medium text-primary hover:underline">
          登录
        </Link>
      </p>
    </AuthShell>
  );
}
