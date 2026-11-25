import { spawn } from "node:child_process";
import path from "node:path";
import type { PlatformId } from "./catalog";
import { accountFor, readConfig } from "./config-store";
import { appendLog, getJob, updateTask } from "./job-store";
import { buildPrompt } from "./prompts";
import { ROOT } from "./paths";
import type { TaskStatus } from "./types";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

const TIMEOUT_MS: Record<PlatformId, number> = {
  tiktok: 20 * 60_000,
  x: 15 * 60_000,
  linkedin: 15 * 60_000,
  wa_estado: 15 * 60_000,
  wa_canal: 15 * 60_000,
  wa_grupos: 90 * 60_000,
};

/** Si el agente no emite nada en este tiempo, se considera colgado. */
const INACTIVITY_MS = 5 * 60_000;

const DISALLOWED = [
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Agent",
];

interface ClaudeRunResult {
  ok: boolean;
  resultText: string;
  costUsd?: number;
  error?: string;
}

interface RunOptions {
  prompt: string;
  model: string;
  allowedTools: string[];
  addDirs?: string[];
  timeoutMs: number;
  /** false para tareas sin navegador (p. ej. adaptar copys). */
  chrome?: boolean;
  onEvent?: (line: string) => void;
}

/** Ejecuta `claude -p --chrome` con el prompt por stdin y devuelve el texto final. */
export function runClaude(opts: RunOptions): Promise<ClaudeRunResult> {
  const args = [
    "-p",
    opts.chrome === false ? "--no-chrome" : "--chrome",
    "--model",
    opts.model,
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  if (opts.allowedTools.length) args.push("--allowedTools", ...opts.allowedTools);
  args.push("--disallowedTools", ...DISALLOWED);
  for (const dir of opts.addDirs ?? []) args.push("--add-dir", dir);

  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let stderr = "";
    let final: ClaudeRunResult | null = null;
    let settled = false;

    const finish = (r: ClaudeRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(idleTimer);
      resolve(r);
    };

    let idleTimer: NodeJS.Timeout;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        child.kill("SIGTERM");
        finish({
          ok: false,
          resultText: "",
          error: `El agente quedó sin actividad ${INACTIVITY_MS / 60000} min (posible selector de archivos de macOS abierto en Chrome: ciérralo con Cancelar). No se confirmó la publicación; revisa la red antes de reintentar.`,
        });
      }, INACTIVITY_MS);
    };
    resetIdle();

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        ok: false,
        resultText: "",
        error: `Tiempo máximo agotado (${Math.round(opts.timeoutMs / 60000)} min)`,
      });
    }, opts.timeoutMs);

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let msg: StreamMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      for (const text of describe(msg)) opts.onEvent?.(text);
      if (msg.type === "result") {
        final = {
          ok: !msg.is_error,
          resultText: typeof msg.result === "string" ? msg.result : "",
          costUsd: msg.total_cost_usd,
          error: msg.is_error
            ? String(msg.result || msg.subtype || "Error del agente")
            : undefined,
        };
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      resetIdle();
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-4000);
    });
    child.on("error", (err) =>
      finish({ ok: false, resultText: "", error: `No se pudo lanzar claude: ${err.message}` }),
    );
    child.on("close", (code) => {
      if (buffer) handleLine(buffer);
      finish(
        final ?? {
          ok: false,
          resultText: "",
          error: `claude terminó con código ${code}. ${stderr.trim()}`.trim(),
        },
      );
    });

    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}

interface StreamMessage {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  total_cost_usd?: number;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
}

function describe(msg: StreamMessage): string[] {
  if (msg.type !== "assistant" || !msg.message?.content) return [];
  const out: string[] = [];
  for (const block of msg.message.content) {
    if (block.type === "text" && block.text?.trim()) {
      out.push(block.text.trim().slice(0, 500));
    } else if (block.type === "tool_use" && block.name) {
      const name = block.name.replace("mcp__claude-in-chrome__", "");
      const input = block.input ?? {};
      const hint =
        (name === "javascript_tool" && typeof input.text === "string"
          ? input.text.replace(/\s+/g, " ").slice(0, 100)
          : "") ||
        (input.url as string) ||
        (input.action as string) ||
        (input.query as string) ||
        (input.deviceId as string) ||
        "";
      out.push(`→ ${name}${hint ? ` · ${String(hint).slice(0, 120)}` : ""}`);
    }
  }
  return out;
}

const VALID_FINAL: TaskStatus[] = [
  "programado",
  "publicado",
  "requiere_accion",
  "fallido",
];

export function parseAgentResult(text: string): {
  estado: TaskStatus;
  detalle: string;
  url: string;
} {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const candidates = blocks.length
    ? blocks.map((b) => b[1])
    : [text.slice(text.lastIndexOf("{"))];
  for (const raw of candidates.reverse()) {
    try {
      const data = JSON.parse(raw.trim());
      const estado = VALID_FINAL.includes(data.estado) ? data.estado : "fallido";
      return {
        estado,
        detalle: String(data.detalle ?? ""),
        url: String(data.url ?? ""),
      };
    } catch {
      // probar el siguiente bloque
    }
  }
  return {
    estado: "fallido",
    detalle: `El agente no devolvió un resultado legible: ${text.slice(-300)}`,
    url: "",
  };
}

/** Ejecuta una tarea de publicación (una plataforma de un trabajo). */
export async function runTask(jobId: string, platform: PlatformId) {
  const job = getJob(jobId);
  if (!job) return;
  const task = job.tasks.find((t) => t.platform === platform);
  if (!task) return;

  const cfg = readConfig();
  const { account, profile } = accountFor(cfg, job.product, platform);

  const fail = (status: TaskStatus, detail: string) =>
    updateTask(jobId, platform, (t) => {
      t.status = status;
      t.detail = detail;
      t.finishedAt = new Date().toISOString();
      t.log.push({ at: t.finishedAt, text: detail });
    });

  if (!profile || !profile.deviceId) {
    fail(
      "requiere_accion",
      "No hay un navegador (deviceId) asignado al perfil de esta cuenta. Configúralo en Ajustes.",
    );
    return;
  }

  updateTask(jobId, platform, (t) => {
    t.status = "ejecutando";
    t.startedAt = new Date().toISOString();
    t.detail = undefined;
    t.log.push({
      at: t.startedAt,
      text: `Iniciando Claude in Chrome en "${profile.label}" (modo ${t.mode === "nativo" ? "programar en la plataforma" : "publicar ahora"})`,
    });
  });

  const fresh = getJob(jobId)!;
  const prompt = buildPrompt({
    job: fresh,
    task: fresh.tasks.find((t) => t.platform === platform)!,
    account,
    profile,
    whatsapp: cfg.whatsapp[job.product],
  });

  const res = await runClaude({
    prompt,
    model: cfg.model,
    allowedTools: ["mcp__claude-in-chrome"],
    addDirs: [path.dirname(job.mediaPath)],
    timeoutMs: TIMEOUT_MS[platform],
    onEvent: (text) => appendLog(jobId, platform, text),
  });

  if (!res.ok) {
    const limit = /limit|rate|quota|credit/i.test(res.error ?? "");
    fail(
      "fallido",
      limit
        ? `Claude alcanzó un límite de uso: ${res.error}. Cambia de cuenta y reintenta.`
        : res.error || "Error desconocido",
    );
    return;
  }

  const parsed = parseAgentResult(res.resultText);
  updateTask(jobId, platform, (t) => {
    t.status = parsed.estado;
    t.detail = parsed.detalle;
    t.url = parsed.url || undefined;
    t.costUsd = res.costUsd;
    t.finishedAt = new Date().toISOString();
    t.log.push({ at: t.finishedAt, text: `Resultado: ${parsed.estado} · ${parsed.detalle}` });
  });
}

/** Pregunta a Claude in Chrome qué navegadores están conectados. */
export async function detectBrowsers(): Promise<
  { deviceId: string; name: string; osPlatform?: string }[]
> {
  const res = await runClaude({
    prompt:
      "Llama a la herramienta list_connected_browsers de claude-in-chrome y responde SOLO con un bloque ```json con el arreglo que devuelve, sin texto adicional.",
    model: "haiku",
    allowedTools: ["mcp__claude-in-chrome__list_connected_browsers"],
    timeoutMs: 3 * 60_000,
  });
  if (!res.ok) throw new Error(res.error || "No se pudo consultar Chrome");
  const m = res.resultText.match(/```json\s*([\s\S]*?)```/);
  const raw = m ? m[1] : res.resultText.slice(res.resultText.indexOf("["));
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Respuesta inesperada");
  return data;
}
