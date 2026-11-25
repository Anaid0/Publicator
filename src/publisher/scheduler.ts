import type { PlatformId } from "./catalog";
import { accountFor, readConfig } from "./config-store";
import { listJobs, saveJob, updateTask } from "./job-store";
import { runTask } from "./runner";

const TICK_MS = 15_000;

interface SchedulerState {
  started: boolean;
  running: boolean;
  lastProfileId?: string;
  timer?: NodeJS.Timeout;
}

// Compartido entre instrumentation y route handlers (mismo proceso Node).
const g = globalThis as unknown as { __publisherScheduler?: SchedulerState };
const state: SchedulerState = (g.__publisherScheduler ??= {
  started: false,
  running: false,
});

/** Tareas que quedaron "ejecutando" si el servidor se reinició a mitad. */
function recoverInterrupted() {
  for (const job of listJobs()) {
    let changed = false;
    for (const t of job.tasks) {
      if (t.status === "ejecutando") {
        t.status = "fallido";
        t.detail =
          "Interrumpida porque el servidor se reinició. Revisa la plataforma antes de reintentar para no duplicar.";
        t.finishedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) saveJob(job);
  }
}

function nextDueTask(): { jobId: string; platform: PlatformId } | null {
  const now = Date.now();
  const cfg = readConfig();
  const due: {
    jobId: string;
    platform: PlatformId;
    runAt: number;
    profileId: string;
  }[] = [];

  for (const job of listJobs()) {
    for (const t of job.tasks) {
      if (t.status !== "en_espera" && t.status !== "en_cola") continue;
      const runAt = new Date(t.runAt).getTime();
      if (runAt > now) continue;
      if (t.status === "en_espera") {
        updateTask(job.id, t.platform, (x) => {
          x.status = "en_cola";
        });
      }
      due.push({
        jobId: job.id,
        platform: t.platform,
        runAt,
        profileId: accountFor(cfg, job.product, t.platform).account.profileId,
      });
    }
  }
  if (!due.length) return null;
  // Primero lo más antiguo; a igualdad, el mismo perfil que la última vez
  // (menos cambios de cuenta en Chrome).
  due.sort((a, b) => {
    const minuteA = Math.floor(a.runAt / 60_000);
    const minuteB = Math.floor(b.runAt / 60_000);
    if (minuteA !== minuteB) return minuteA - minuteB;
    const sameA = a.profileId === state.lastProfileId ? 0 : 1;
    const sameB = b.profileId === state.lastProfileId ? 0 : 1;
    return sameA - sameB;
  });
  state.lastProfileId = due[0].profileId;
  return due[0];
}

/** Ejecuta las tareas vencidas una a una (Chrome no admite trabajo en paralelo). */
export async function tick() {
  if (state.running) return;
  state.running = true;
  try {
    for (;;) {
      const next = nextDueTask();
      if (!next) break;
      try {
        await runTask(next.jobId, next.platform);
      } catch (err) {
        updateTask(next.jobId, next.platform, (t) => {
          t.status = "fallido";
          t.detail = `Error interno: ${(err as Error).message}`;
          t.finishedAt = new Date().toISOString();
        });
      }
    }
  } finally {
    state.running = false;
  }
}

export function startScheduler() {
  if (state.started) return;
  state.started = true;
  recoverInterrupted();
  state.timer = setInterval(() => void tick(), TICK_MS);
  void tick();
  console.log("[publicador] scheduler iniciado");
}

export function isSchedulerBusy() {
  return state.running;
}
