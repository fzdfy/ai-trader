import { useMutation } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// ---------- types ----------

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ---------- hooks ----------

/**
 * 上传头像：将本地图片文件上传到后端，返回可访问的图片 URL。
 */
export function useUploadAvatar() {
  const userId = authClient.useSession().data?.user.id;

  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/v1/profile/avatar", {
        method: "POST",
        headers: { "X-User-Id": userId ?? "" },
        body: formData,
      });
      const json = (await res.json()) as ApiResponse<{ url: string }>;
      if (!json.success) throw new Error(json.error ?? "头像上传失败");
      return json.data;
    },
  });
}
