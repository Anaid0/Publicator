"use client";

/* eslint-disable @next/next/no-img-element */
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  RotateCcw,
  Send,
  Sparkles,
  Upload,
  X as XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHROME_UPLOAD_LIMIT_BYTES,
  COPY_LIMITS,
  copyLength,
  NATIVE_SCHEDULE_MIN_LEAD_MINUTES,
  PLATFORMS,
  PRODUCTS,
  isPlatformId,
  isProductId,
  type PlatformId,
  type ProductId,
} from "@/publisher/catalog";
import type {
  PublishJob,
  PublishTask,
  PublisherConfig,
} from "@/publisher/types";
import { PublisherShell, StatusChip, inputClass } from "./ui";

const ACTIVE = ["en_espera", "en_cola", "ejecutando"];

function defaultTime() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  if (d.getDate() !== new Date().getDate()) return "23:55";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function minutesUntil(time: string) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return (d.getTime() - Date.now()) / 60_000;
}

function formatBytes(n: number) {
  return n > 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border-dim py-5 first:pt-0 last:border-0">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PublicarPage() {
  const [config, setConfig] = useState<PublisherConfig | null>(null);
  const [product, setProduct] = useState<ProductId | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [time, setTime] = useState(defaultTime);
  const [copy, setCopy] = useState("");
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [copies, setCopies] = useState<Partial<Record<PlatformId, string>>>({});
  const [copyTab, setCopyTab] = useState<PlatformId | null>(null);
  const [adapting, setAdapting] = useState(false);
  const [adaptedFrom, setAdaptedFrom] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/publicar/config")
      .then((r) => r.json())
      .then((d: { config: PublisherConfig }) => {
        setConfig(d.config);
        // Preselección desde el panel: /publicar?product=x&platform=y
        const params = new URLSearchParams(window.location.search);
        const p = params.get("product");
        const pl = params.get("platform");
        if (p && isProductId(p)) {
          setProduct(p);
          const acc = pl && isPlatformId(pl) ? d.config.accounts[p][pl] : null;
          const hasBrowser = d.config.profiles.some(
            (x) => x.id === acc?.profileId && x.deviceId,
          );
          if (pl && isPlatformId(pl) && acc?.enabled && hasBrowser) {
            setPlatforms([pl]);
          }
        }
      });
  }, []);

  const loadJobs = useCallback(async () => {
    const r = await fetch("/api/publicar", { cache: "no-store" });
    const d = await r.json();
    setJobs(d.jobs ?? []);
  }, []);

  const anyActive = jobs.some((j) =>
    j.tasks.some((t) => ACTIVE.includes(t.status)),
  );

  useEffect(() => {
    void loadJobs();
    const id = setInterval(loadJobs, anyActive ? 3000 : 15000);
    return () => clearInterval(id);
  }, [loadJobs, anyActive]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const enabledPlatforms = useMemo(() => {
    if (!config || !product) return new Set<PlatformId>();
    return new Set(
      PLATFORMS.filter((p) => {
        const acc = config.accounts[product][p.id];
        const profile = config.profiles.find((x) => x.id === acc.profileId);
        return acc.enabled && Boolean(profile?.deviceId);
      }).map((p) => p.id),
    );
  }, [config, product]);

  const selectProduct = (id: ProductId) => {
    setProduct(id);
    setPlatforms((prev) =>
      prev.filter((p) => config?.accounts[id][p].enabled ?? true),
    );
  };

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      setError("El archivo debe ser una imagen o un video");
      return;
    }
    setError(null);
    setFile(f);
  };

  const togglePlatform = (id: PlatformId) =>
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  const lead = minutesUntil(time);

  const adapt = async () => {
    if (!product || !copy.trim() || !platforms.length) return;
    setAdapting(true);
    setError(null);
    try {
      const r = await fetch("/api/publicar/adaptar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, copy, platforms }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCopies((prev) => ({ ...prev, ...d.copies }));
      setAdaptedFrom(copy);
      setCopyTab(platforms[0]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdapting(false);
    }
  };

  const overLimit = platforms.filter(
    (p) => copies[p] && copyLength(p, copies[p]!) > COPY_LIMITS[p],
  );

  const canSubmit =
    product && file && time && platforms.length > 0 && overLimit.length === 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("product", product);
      fd.set("file", file);
      fd.set("time", time);
      fd.set("copy", copy);
      fd.set(
        "copies",
        JSON.stringify(
          Object.fromEntries(platforms.filter((p) => copies[p]).map((p) => [p, copies[p]])),
        ),
      );
      platforms.forEach((p) => fd.append("platforms", p));
      const r = await fetch("/api/publicar", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setFile(null);
      setCopy("");
      setPlatforms([]);
      setCopies({});
      setAdaptedFrom(null);
      setTime(defaultTime());
      if (fileInput.current) fileInput.current.value = "";
      await loadJobs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublisherShell title="Publicar hoy" active="publicar">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-xl border border-border-dim bg-background-elevated p-5">
          <Step n={1} title="Producto">
            <div className="grid grid-cols-2 gap-2">
              {PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProduct(p.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    product === p.id
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </Step>

          <Step n={2} title="Imagen o video">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {file && preview ? (
              <div className="relative overflow-hidden rounded-lg border border-border bg-black">
                {file.type.startsWith("video/") ? (
                  <video src={preview} controls className="max-h-72 w-full object-contain" />
                ) : (
                  <img src={preview} alt="" className="max-h-72 w-full object-contain" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="absolute top-2 right-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
                  aria-label="Quitar archivo"
                >
                  <XIcon className="size-4" />
                </button>
                <div className="flex justify-between gap-2 border-t border-border-dim bg-background-elevated px-3 py-2 text-xs text-muted-foreground">
                  <span className="truncate">{file.name}</span>
                  <span>{formatBytes(file.size)}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors",
                  dragging ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground",
                )}
              >
                <Upload className="size-5" />
                Arrastra el archivo o haz clic para elegirlo
              </button>
            )}
            {file && file.size > CHROME_UPLOAD_LIMIT_BYTES && (
              <p className="mt-2 text-xs text-amber-300">
                Pesa más de 10 MB: Claude in Chrome puede no lograr subirlo.
                Comprímelo si falla.
              </p>
            )}
            <label className="mt-4 block text-xs text-muted-foreground">
              Copy
              <textarea
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                rows={6}
                placeholder="Pega aquí el copy de Paperclip"
                className={cn(inputClass, "mt-1.5 resize-y")}
              />
            </label>
            <p className="mt-1 text-right text-xs text-muted-foreground-dim">
              {copy.length} caracteres
              {copy.length > 280 && platforms.includes("x") && " · en X se resumirá a 280"}
            </p>
          </Step>

          <Step n={3} title="Hora (hoy)">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={cn(inputClass, "w-36 [color-scheme:dark]")}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {lead <= 0
                ? "Esa hora ya pasó: se publicará de inmediato."
                : lead < NATIVE_SCHEDULE_MIN_LEAD_MINUTES
                  ? "Faltan menos de 20 min: Chrome publicará a esa hora."
                  : "TikTok, X y LinkedIn se programan ya en la plataforma; WhatsApp se publica a esa hora (deja el Mac encendido)."}
            </p>
          </Step>

          <Step n={4} title="Plataformas">
            {!product ? (
              <p className="text-xs text-muted-foreground">Elige primero el producto.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PLATFORMS.map((p) => {
                  const enabled = enabledPlatforms.has(p.id);
                  const checked = platforms.includes(p.id);
                  const native =
                    p.nativeSchedule && lead >= NATIVE_SCHEDULE_MIN_LEAD_MINUTES;
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                        !enabled && "cursor-not-allowed opacity-40",
                        checked ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={!enabled}
                        checked={checked}
                        onChange={() => togglePlatform(p.id)}
                        className="mt-0.5 accent-[var(--primary)]"
                      />
                      <span>
                        {p.label}
                        <span className="block text-xs text-muted-foreground">
                          {!enabled
                            ? !config?.accounts[product][p.id].enabled
                              ? config?.accounts[product][p.id].notes ||
                                "Desactivada en Ajustes"
                              : `Falta asignar navegador a "${
                                  config.profiles.find(
                                    (x) => x.id === config.accounts[product][p.id].profileId,
                                  )?.label ?? "perfil"
                                }"`
                            : native
                              ? "Se programa en la plataforma"
                              : "Se publica a la hora"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {product && platforms.length > 0 && (
              <div className="mt-5 rounded-lg border border-border-dim bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium">Copy por red</span>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={adapting}
                    disabled={!copy.trim()}
                    onClick={adapt}
                  >
                    <Sparkles /> Adaptar copy por red
                  </Button>
                </div>
                {!copy.trim() && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Escribe el copy en el paso 2 para adaptarlo.
                  </p>
                )}
                {adaptedFrom !== null && adaptedFrom !== copy && (
                  <p className="mt-2 text-xs text-amber-300">
                    Cambiaste el copy original: vuelve a adaptar si quieres que se refleje.
                  </p>
                )}
                {platforms.some((p) => copies[p] !== undefined) && (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {platforms.map((p) => {
                        const text = copies[p];
                        const over = text !== undefined && copyLength(p, text) > COPY_LIMITS[p];
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCopyTab(p)}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs",
                              (copyTab ?? platforms[0]) === p
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                              over && "text-red-300",
                            )}
                          >
                            {PLATFORMS.find((x) => x.id === p)?.label}
                            {text === undefined && " · original"}
                          </button>
                        );
                      })}
                    </div>
                    {(() => {
                      const tab = copyTab && platforms.includes(copyTab) ? copyTab : platforms[0];
                      const text = copies[tab];
                      if (text === undefined) {
                        return (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Esta red usará el copy original (el agente solo lo ajusta si
                            la red lo exige). Pulsa &quot;Adaptar&quot; para generar su versión.
                          </p>
                        );
                      }
                      const len = copyLength(tab, text);
                      return (
                        <>
                          <textarea
                            value={text}
                            onChange={(e) =>
                              setCopies((prev) => ({ ...prev, [tab]: e.target.value }))
                            }
                            rows={7}
                            className={cn(inputClass, "mt-2 resize-y")}
                          />
                          <div className="mt-1 flex justify-between text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setCopies((prev) => {
                                  const next = { ...prev };
                                  delete next[tab];
                                  return next;
                                })
                              }
                              className="text-muted-foreground hover:text-foreground"
                            >
                              Usar el original
                            </button>
                            <span
                              className={len > COPY_LIMITS[tab] ? "text-red-300" : "text-muted-foreground-dim"}
                            >
                              {len} / {COPY_LIMITS[tab]}
                              {tab === "x" && " (enlaces = 23)"}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </Step>

          <Step n={5} title="Ejecutar">
            {error && (
              <p className="mb-3 rounded-md bg-background-error px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </p>
            )}
            {overLimit.length > 0 && (
              <p className="mb-3 text-xs text-red-300">
                El copy de {overLimit.map((p) => PLATFORMS.find((x) => x.id === p)?.label).join(", ")} supera el límite.
              </p>
            )}
            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
              loading={submitting}
              onClick={submit}
            >
              <Send /> Publicar con Claude in Chrome
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Se ejecuta una plataforma a la vez en el perfil de Chrome de cada
              cuenta. Mantén Chrome abierto con las sesiones iniciadas.
            </p>
          </Step>
        </div>

        <div className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Hoy</h2>
            <span className="text-xs text-muted-foreground">
              {anyActive ? "Actualizando cada 3 s" : `${jobs.length} publicaciones`}
            </span>
          </div>
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-dim px-6 py-16 text-center text-sm text-muted-foreground">
              <CalendarClock className="size-5" />
              Aún no hay publicaciones hoy.
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} onChange={loadJobs} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PublisherShell>
  );
}

function JobCard({ job, onChange }: { job: PublishJob; onChange: () => void }) {
  const product = PRODUCTS.find((p) => p.id === job.product);
  return (
    <article className="overflow-hidden rounded-xl border border-border-dim bg-background-elevated">
      <div className="flex gap-4 p-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black">
          {job.mediaType === "image" ? (
            <img src={`/api/publicar/${job.id}/media`} alt="" className="size-full object-cover" />
          ) : (
            <video src={`/api/publicar/${job.id}/media`} muted className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">{product?.name}</span>
            <span className="text-sm text-muted-foreground">
              {job.date === new Date().toLocaleDateString("en-CA") ? "Hoy" : job.date} · {job.time}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground-dim">
              <ImageIcon className="size-3" />
              {job.mediaType === "video" ? "Video" : "Imagen"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {job.copy || "Sin copy"}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border-dim border-t border-border-dim">
        {job.tasks.map((t) => (
          <TaskRow
            key={t.platform}
            jobId={job.id}
            task={t}
            approvedCopy={job.copies?.[t.platform]}
            onChange={onChange}
          />
        ))}
      </ul>
    </article>
  );
}

function TaskRow({
  jobId,
  task,
  approvedCopy,
  onChange,
}: {
  jobId: string;
  task: PublishTask;
  approvedCopy?: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = PLATFORMS.find((p) => p.id === task.platform)?.label;

  const act = async (action: "retry" | "cancel") => {
    setBusy(true);
    await fetch(`/api/publicar/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, platform: task.platform }),
    });
    setBusy(false);
    onChange();
  };

  const runAt = new Date(task.runAt).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-36 text-sm">{label}</span>
        <StatusChip status={task.status} />
        <span className="text-xs text-muted-foreground-dim">
          {task.mode === "nativo" ? "programar en plataforma" : `publicar a las ${runAt}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {task.url && (
            <a href={task.url} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Abrir publicación">
              <ExternalLink className="size-4" />
            </a>
          )}
          {["fallido", "requiere_accion", "cancelado"].includes(task.status) && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => act("retry")}>
              <RotateCcw /> Reintentar
            </Button>
          )}
          {["en_espera", "en_cola"].includes(task.status) && (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => act("cancel")}>
              Cancelar
            </Button>
          )}
          {(task.log.length > 0 || approvedCopy) && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Ver registro">
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </button>
          )}
        </div>
      </div>
      {task.detail && <p className="mt-1.5 text-xs text-muted-foreground">{task.detail}</p>}
      {open && approvedCopy && (
        <div className="mt-2 rounded-md border border-border-dim p-3 text-xs whitespace-pre-wrap text-muted-foreground">
          <span className="mb-1 block font-medium text-foreground">Copy aprobado</span>
          {approvedCopy}
        </div>
      )}
      {open && task.log.length > 0 && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {task.log
            .map((l) => `${new Date(l.at).toLocaleTimeString("es-CO")}  ${l.text}`)
            .join("\n")}
        </pre>
      )}
    </li>
  );
}
