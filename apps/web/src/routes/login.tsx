import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

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
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });
    setIsLoading(false);
    if (signInError) {
      setError(signInError.message ?? "登录失败");
      return;
    }
    navigate({ to: "/market" });
  };

  return (
    <VStack gap={6} align="center" justify="center" style={{ minHeight: "100vh" }}>
      <Card padding={6} width={400}>
        <VStack gap={5}>
          <VStack gap={2}>
            <Heading level={2}>登录 AI Trader</Heading>
            <Text type="supporting">输入邮箱和密码登录</Text>
          </VStack>

          <VStack gap={4}>
            <TextInput
              label="邮箱"
              type="email"
              placeholder="请输入邮箱地址"
              value={email}
              onChange={setEmail}
            />
            <TextInput
              label="密码"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={setPassword}
            />
            <Button
              label={isLoading ? "登录中..." : "登录"}
              variant="primary"
              isDisabled={!email || !password || isLoading}
              onClick={handleSignIn}
            />
          </VStack>

          <HStack gap={1} justify="center">
            <Text type="supporting">没有账户？</Text>
            <Link to="/signup" style={{ textDecoration: "none" }}>
              <Text style={{ color: "var(--color-text-accent)" }}>注册</Text>
            </Link>
          </HStack>

          {error && (
            <Text type="supporting" style={{ color: "var(--color-error)" }}>
              {error}
            </Text>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
