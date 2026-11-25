import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  NATIVE_SCHEDULE_MIN_LEAD_MINUTES,
  getPlatform,
  getProduct,
  type MediaType,
  type PlatformId,
  type ProductId,
} from "./catalog";
import { getJob, saveJob } from "./job-store";
import { CONTENT_DIR, localDate, safeFileName, todayAt } from "./paths";
import { startScheduler, tick } from "./scheduler";
import type { PublishJob, PublishTask } from "./types";

export interface CreateJobInput {
  product: ProductId;
  file: { name: string; bytes: Uint8Array; type: string };
  copy: string;
  copies?: Partial<Record<PlatformId, string>>;
  time: string; // HH:mm
  platforms: PlatformId[];
}

export function mediaTypeOf(mime: string, name: string): MediaType | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const ext = path.extname(name).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return "video";
  return null;
}

function planTask(platform: PlatformId, publishAt: Date): PublishTask {
  const now = Date.now();
  const leadMin = (publishAt.getTime() - now) / 60_000;
  const def = getPlatform(platform);
  const native =
    def.nativeSchedule && leadMin >= NATIVE_SCHEDULE_MIN_LEAD_MINUTES;
  // Nativo: Chrome entra ya y deja programado para la hora elegida.
  // A la hora: Chrome publica cuando llega la hora (o ya, si pasó).
  const runAt = native ? new Date(now) : new Date(Math.max(now, publishAt.getTime()));
  return {
    platform,
    mode: native ? "nativo" : "a_la_hora",
    status: runAt.getTime() <= now ? "en_cola" : "en_espera",
    runAt: runAt.toISOString(),
    log: [],
  };
}

export function createJob(input: CreateJobInput): PublishJob {
  const mediaType = mediaTypeOf(input.file.type, input.file.name);
  if (!mediaType) throw new Error("El archivo debe ser una imagen o un video");
  if (!/^\d{2}:\d{2}$/.test(input.time)) throw new Error("Hora inválida");
  if (!input.platforms.length) throw new Error("Elige al menos una plataforma");

  const date = localDate();
  const publishAt = todayAt(input.time);
  const id = `${date}-${crypto.randomBytes(4).toString("hex")}`;
  const dir = path.join(CONTENT_DIR, getProduct(input.product).name, date);
  fs.mkdirSync(dir, { recursive: true });
  const mediaName = `${input.time.replace(":", "")}_${id.slice(-8)}_${safeFileName(input.file.name)}`;
  const mediaPath = path.join(dir, mediaName);
  fs.writeFileSync(mediaPath, input.file.bytes);

  const job: PublishJob = {
    id,
    product: input.product,
    mediaPath,
    mediaName,
    mediaType,
    mediaBytes: input.file.bytes.length,
    copy: input.copy,
    copies: Object.fromEntries(
      Object.entries(input.copies ?? {}).filter(
        ([k, v]) => input.platforms.includes(k as PlatformId) && v?.trim(),
      ),
    ),
    date,
    time: input.time,
    publishAt: publishAt.toISOString(),
    createdAt: new Date().toISOString(),
    tasks: [...new Set(input.platforms)].map((p) => planTask(p, publishAt)),
  };
  saveJob(job);
  startScheduler();
  void tick();
  return job;
}

export function retryTask(jobId: string, platform: PlatformId) {
  const job = getJob(jobId);
  if (!job) throw new Error("Publicación no encontrada");
  const idx = job.tasks.findIndex((t) => t.platform === platform);
  if (idx < 0) throw new Error("Plataforma no encontrada");
  if (job.tasks[idx].status === "ejecutando") throw new Error("Ya se está ejecutando");
  const fresh = planTask(platform, new Date(job.publishAt));
  job.tasks[idx] = {
    ...fresh,
    log: [
      ...job.tasks[idx].log,
      { at: new Date().toISOString(), text: "— Reintento —" },
    ],
  };
  saveJob(job);
  startScheduler();
  void tick();
  return job;
}

export function cancelTask(jobId: string, platform: PlatformId) {
  const job = getJob(jobId);
  if (!job) throw new Error("Publicación no encontrada");
  const task = job.tasks.find((t) => t.platform === platform);
  if (!task) throw new Error("Plataforma no encontrada");
  if (task.status !== "en_espera" && task.status !== "en_cola") {
    throw new Error("Solo se pueden cancelar tareas que no han empezado");
  }
  task.status = "cancelado";
  task.finishedAt = new Date().toISOString();
  saveJob(job);
  return job;
}
