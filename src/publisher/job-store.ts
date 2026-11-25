import fs from "node:fs";
import path from "node:path";
import type { PlatformId } from "./catalog";
import { JOBS_DIR } from "./paths";
import type { PublishJob, PublishTask } from "./types";

const MAX_LOG_ENTRIES = 400;

function jobFile(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("id inválido");
  return path.join(JOBS_DIR, `${id}.json`);
}

export function saveJob(job: PublishJob) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const file = jobFile(job.id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, file);
}

export function getJob(id: string): PublishJob | null {
  try {
    return JSON.parse(fs.readFileSync(jobFile(id), "utf8"));
  } catch {
    return null;
  }
}

export function listJobs(): PublishJob[] {
  if (!fs.existsSync(JOBS_DIR)) return [];
  const jobs: PublishJob[] = [];
  for (const f of fs.readdirSync(JOBS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const job = getJob(f.replace(/\.json$/, ""));
    if (job) jobs.push(job);
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Lee-modifica-escribe una tarea. Todo corre en un solo proceso Node. */
export function updateTask(
  jobId: string,
  platform: PlatformId,
  fn: (task: PublishTask, job: PublishJob) => void,
): PublishJob | null {
  const job = getJob(jobId);
  if (!job) return null;
  const task = job.tasks.find((t) => t.platform === platform);
  if (!task) return null;
  fn(task, job);
  if (task.log.length > MAX_LOG_ENTRIES) {
    task.log = task.log.slice(-MAX_LOG_ENTRIES);
  }
  saveJob(job);
  return job;
}

export function appendLog(jobId: string, platform: PlatformId, text: string) {
  updateTask(jobId, platform, (task) => {
    task.log.push({ at: new Date().toISOString(), text });
  });
}
