"use client";

import { ArrowRight, Clapperboard, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PLATFORMS, PRODUCTS, type PlatformId, type ProductId } from "@/publisher/catalog";
import type { PublishJob, PublisherConfig, TaskStatus } from "@/publisher/types";
import { PublisherShell } from "./publicar/ui";

type Readiness = "lista" | "sin_navegador" | "desactivada";

function readiness(
  config: PublisherConfig,
  product: ProductId,
  platform: PlatformId,
): Readiness {
  const acc = config.accounts[product][platform];
  if (!acc.enabled) return "desactivada";
  const profile = config.profiles.find((p) => p.id === acc.profileId);
  return profile?.deviceId ? "lista" : "sin_navegador";
}

const READY_STYLE: Record<Readiness, { dot: string; label: string }> = {
  lista: { dot: "bg-emerald-400", label: "Lista" },
  sin_navegador: { dot: "bg-amber-400", label: "Falta asignar navegador" },
  desactivada: { dot: "bg-zinc-600", label: "Desactivada" },
};

const SUMMARY: { label: string; statuses: TaskStatus[]; tone: string }[] = [
  { label: "En curso", statuses: ["en_espera", "en_cola", "ejecutando"], tone: "text-sky-300" },
  { label: "Programadas", statuses: ["programado"], tone: "text-violet-300" },
  { label: "Publicadas", statuses: ["publicado"], tone: "text-emerald-300" },
  { label: "Requieren acción", statuses: ["requiere_accion", "fallido"], tone: "text-amber-300" },
];

export default function Panel() {
  const [config, setConfig] = useState<PublisherConfig | null>(null);
  const [jobs, setJobs] = useState<PublishJob[]>([]);

  useEffect(() => {
    fetch("/api/publicar/config")
      .then((r) => r.json())
      .then((d) => setConfig(d.config));
    const load = () =>
      fetch("/api/publicar", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setJobs(d.jobs ?? []));
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const tasks = jobs.flatMap((j) => j.tasks.map((t) => ({ ...t, product: j.product })));

  return (
    <PublisherShell title="Todos los productos" active="inicio">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          {SUMMARY.map((s) => (
            <div key={s.label}>
              <div className={cn("text-2xl font-semibold tabular-nums", s.tone)}>
                {tasks.filter((t) => s.statuses.includes(t.status)).length}
              </div>
              <div className="text-xs text-muted-foreground">{s.label} hoy</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/publicar"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            <Send className="size-4" /> Nueva publicación
          </Link>
          <Link
            href="/videos"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent"
          >
            <Clapperboard className="size-4" /> Crear video
          </Link>
        </div>
      </div>

      {!config ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PRODUCTS.map((product) => {
            const productTasks = tasks.filter((t) => t.product === product.id);
            const readyCount = PLATFORMS.filter(
              (p) => readiness(config, product.id, p.id) === "lista",
            ).length;
            return (
              <section
                key={product.id}
                className="flex flex-col rounded-xl border border-border-dim bg-background-elevated"
              >
                <header className="flex items-baseline justify-between gap-3 border-b border-border-dim px-5 py-4">
                  <h2 className="text-base font-semibold">{product.name}</h2>
                  <span className="text-xs text-muted-foreground">
                    {readyCount} de {PLATFORMS.length} redes listas ·{" "}
                    {productTasks.length} tareas hoy
                  </span>
                </header>
                <ul className="flex-1 divide-y divide-border-dim">
                  {PLATFORMS.map((platform) => {
                    const state = readiness(config, product.id, platform.id);
                    const acc = config.accounts[product.id][platform.id];
                    const profile = config.profiles.find((p) => p.id === acc.profileId);
                    const todayCount = productTasks.filter(
                      (t) => t.platform === platform.id,
                    ).length;
                    const body = (
                      <>
                        <span className={cn("size-2 shrink-0 rounded-full", READY_STYLE[state].dot)} />
                        <span className="w-36 shrink-0 text-sm">{platform.label}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {state === "lista"
                            ? `${acc.account || "Cuenta sin definir"} · ${profile?.label ?? ""}`
                            : state === "desactivada"
                              ? acc.notes || READY_STYLE[state].label
                              : `${READY_STYLE[state].label} (${profile?.label ?? "sin perfil"})`}
                        </span>
                        {todayCount > 0 && (
                          <span className="rounded-full bg-accent px-2 text-xs text-muted-foreground">
                            {todayCount} hoy
                          </span>
                        )}
                        {state === "lista" && (
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground-dim transition-colors group-hover:text-foreground" />
                        )}
                      </>
                    );
                    return (
                      <li key={platform.id}>
                        {state === "lista" ? (
                          <Link
                            href={`/publicar?product=${product.id}&platform=${platform.id}`}
                            className="group flex items-center gap-3 px-5 py-2.5 hover:bg-accent/50"
                            title={`Publicar en ${platform.label} de ${product.name}`}
                          >
                            {body}
                          </Link>
                        ) : (
                          <Link
                            href="/publicar/ajustes"
                            className="flex items-center gap-3 px-5 py-2.5 opacity-60 hover:opacity-100"
                            title="Configurar en Ajustes"
                          >
                            {body}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <footer className="flex gap-2 border-t border-border-dim px-5 py-3">
                  <Link
                    href={`/publicar?product=${product.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm hover:bg-secondary"
                  >
                    <Send className="size-3.5" /> Publicar en {product.name}
                  </Link>
                  <Link
                    href="/videos"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Clapperboard className="size-3.5" /> Video
                  </Link>
                </footer>
              </section>
            );
          })}
        </div>
      )}
    </PublisherShell>
  );
}
