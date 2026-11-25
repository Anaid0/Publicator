import fs from "node:fs";
import path from "node:path";
import { getJob } from "@/publisher/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job || !fs.existsSync(job.mediaPath)) {
    return new Response("No encontrado", { status: 404 });
  }
  const data = fs.readFileSync(job.mediaPath);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type":
        MIME[path.extname(job.mediaPath).toLowerCase()] ??
        "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
