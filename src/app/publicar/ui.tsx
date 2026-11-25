import Link from "next/link";
import type { TaskStatus } from "@/publisher/types";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  en_espera: "En espera",
  en_cola: "En cola",
  ejecutando: "Ejecutando",
  programado: "Programado",
  publicado: "Publicado",
  requiere_accion: "Requiere acción",
  fallido: "Fallido",
  cancelado: "Cancelado",
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  en_espera: "bg-zinc-800 text-zinc-300",
  en_cola: "bg-sky-950 text-sky-300",
  ejecutando: "bg-sky-900 text-sky-200 animate-pulse",
  programado: "bg-violet-950 text-violet-300",
  publicado: "bg-emerald-950 text-emerald-300",
  requiere_accion: "bg-amber-950 text-amber-300",
  fallido: "bg-red-950 text-red-300",
  cancelado: "bg-zinc-900 text-zinc-500",
};

export function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PublisherShell({
  title,
  active,
  children,
}: {
  title: string;
  active: "inicio" | "publicar" | "ajustes";
  children: React.ReactNode;
}) {
  const tab = (href: string, label: string, key: typeof active) => (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        active === key
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="h-screen overflow-y-auto">
      <header className="sticky top-0 z-10 border-b border-border-dim bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="text-base font-semibold">Publicador</span>
            <span className="text-sm text-muted-foreground">{title}</span>
          </div>
          <nav className="flex gap-1">
            {tab("/", "Panel", "inicio")}
            {tab("/publicar", "Publicar", "publicar")}
            <Link
              href="/videos"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Crear video
            </Link>
            {tab("/publicar/ajustes", "Ajustes", "ajustes")}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground-dim focus:border-primary focus:outline-none";
