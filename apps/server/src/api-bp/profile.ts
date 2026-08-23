import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ok, badRequest, serverError } from "../lib/response";

// 头像上传目录（相对服务进程 cwd，即 apps/server）
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "avatars");

// 允许的图片 MIME 类型 → 文件扩展名
const IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// 头像大小上限 2MB
const MAX_SIZE = 2 * 1024 * 1024;

const profileRoute = new Hono();

/**
 * POST /api/v1/profile/avatar — 上传头像图片
 * 接收 multipart/form-data（字段名 file），保存到本地 uploads/avatars，
 * 返回可访问的相对 URL（由前端通过 /uploads 代理到本服务静态资源）。
 */
profileRoute.post("/avatar", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || typeof file === "string") {
    return badRequest(c, "请选择要上传的图片");
  }

  const ext = IMAGE_EXT[file.type];
  if (!ext) {
    return badRequest(c, "仅支持 png / jpg / webp / gif 格式");
  }

  if (file.size > MAX_SIZE) {
    return badRequest(c, "图片大小不能超过 2MB");
  }

  try {
    const filename = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return ok(c, { url: `/uploads/avatars/${filename}` });
  } catch (err) {
    console.error("头像上传失败", err);
    return serverError(c, "头像上传失败");
  }
});

export { profileRoute };
