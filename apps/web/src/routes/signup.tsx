import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { VStack, HStack } from "@astryxdesign/core/Stack";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async () => {
    if (!name || !email || !password) return;
    setIsLoading(true);
    setError("");
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setIsLoading(false);
    if (signUpError) {
      setError(signUpError.message ?? "注册失败");
      return;
    }
    navigate({ to: "/market" });
  };

  return (
    <VStack gap={6} align="center" justify="center" style={{ minHeight: "100vh" }}>
      <Card padding={6} width={400}>
        <VStack gap={5}>
          <VStack gap={2}>
            <Heading level={2}>注册 AI Trader</Heading>
            <Text type="supporting">创建账户开始使用</Text>
          </VStack>

          <VStack gap={4}>
            <TextInput
              label="用户名"
              placeholder="请输入用户名"
              value={name}
              onChange={setName}
            />
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
              placeholder="请输入密码（至少8位）"
              value={password}
              onChange={setPassword}
            />
            <Button
              label={isLoading ? "注册中..." : "注册"}
              variant="primary"
              isDisabled={!name || !email || password.length < 8 || isLoading}
              onClick={handleSignUp}
            />
          </VStack>

          <HStack gap={1} justify="center">
            <Text type="supporting">已有账户？</Text>
            <Link to="/login" style={{ textDecoration: "none" }}>
              <Text style={{ color: "var(--color-text-accent)" }}>登录</Text>
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
