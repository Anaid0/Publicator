"use client";

import { Plus, Radar, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PLATFORMS,
  PRODUCTS,
  type PlatformId,
  type ProductId,
} from "@/publisher/catalog";
import type { AccountConfig, PublisherConfig } from "@/publisher/types";
import { PublisherShell, inputClass } from "../ui";

interface Browser {
  deviceId: string;
  name: string;
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-dim bg-background-elevated p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AjustesPage() {
  const [config, setConfig] = useState<PublisherConfig | null>(null);
  const [browsers, setBrowsers] = useState<Browser[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<ProductId>("verificaya");

  useEffect(() => {
    fetch("/api/publicar/config")
      .then((r) => r.json())
      .then((d) => setConfig(d.config));
  }, []);

  if (!config) {
    return (
      <PublisherShell title="Ajustes" active="ajustes">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PublisherShell>
    );
  }

  const update = (fn: (c: PublisherConfig) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setMessage(null);
  };

  const setAccount = (
    product: ProductId,
    platform: PlatformId,
    patch: Partial<AccountConfig>,
  ) =>
    update((c) => {
      c.accounts[product][platform] = {
        ...c.accounts[product][platform],
        ...patch,
      };
    });

  const detect = async () => {
    setDetecting(true);
    setMessage(null);
    try {
      const r = await fetch("/api/publicar/browsers", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBrowsers(d.browsers);
      setMessage(`${d.browsers.length} navegadores conectados.`);
    } catch (err) {
      setMessage(`No se pudo detectar: ${(err as Error).message}`);
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const r = await fetch("/api/publicar/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      setConfig(d.config);
      setMessage("Ajustes guardados.");
    } else setMessage(d.error);
  };

  return (
    <PublisherShell title="Ajustes" active="ajustes">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Se guardan en <code className="text-foreground">data/publicador.json</code>.
          </p>
          <div className="flex items-center gap-3">
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
            <Button onClick={save} loading={saving}>
              <Save /> Guardar
            </Button>
          </div>
        </div>

        <Card
          title="Perfiles de Chrome"
          description="Cada perfil de Chrome con la extensión Claude in Chrome aparece como un navegador conectado. Asigna a cada perfil su navegador. Para saber cuál es cuál, abre la extensión en cada perfil y renómbrala, o conéctalos uno a uno."
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={detect} loading={detecting}>
              <Radar /> Detectar navegadores conectados
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Modelo del agente
              <select
                value={config.model}
                onChange={(e) => update((c) => (c.model = e.target.value))}
                className={cn(inputClass, "w-auto py-1.5")}
              >
                <option value="sonnet">Sonnet (recomendado)</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
              </select>
            </label>
          </div>
          <div className="space-y-3">
            {config.profiles.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <input
                  value={p.label}
                  onChange={(e) => update((c) => (c.profiles[i].label = e.target.value))}
                  placeholder="Nombre del perfil"
                  className={inputClass}
                />
                {browsers.length ? (
                  <select
                    value={p.deviceId}
                    onChange={(e) => update((c) => (c.profiles[i].deviceId = e.target.value))}
                    className={inputClass}
                  >
                    <option value="">Sin navegador</option>
                    {p.deviceId && !browsers.some((b) => b.deviceId === p.deviceId) && (
                      <option value={p.deviceId}>{p.deviceId} (no conectado)</option>
                    )}
                    {browsers.map((b) => (
                      <option key={b.deviceId} value={b.deviceId}>
                        {b.name} · {b.deviceId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={p.deviceId}
                    onChange={(e) => update((c) => (c.profiles[i].deviceId = e.target.value.trim()))}
                    placeholder="deviceId (usa Detectar)"
                    className={cn(inputClass, "font-mono text-xs")}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Eliminar perfil"
                  disabled={config.profiles.length <= 1}
                  onClick={() => update((c) => c.profiles.splice(i, 1))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() =>
              update((c) =>
                c.profiles.push({
                  id: `perfil-${Date.now().toString(36)}`,
                  label: "Nuevo perfil",
                  deviceId: "",
                }),
              )
            }
          >
            <Plus /> Añadir perfil (p. ej. uno por número de WhatsApp)
          </Button>
        </Card>

        <Card
          title="Cuentas por producto"
          description="Qué perfil de Chrome usa cada red y qué cuenta debe estar abierta. Claude no escribe contraseñas: inicia sesión una vez en cada perfil y deja la sesión abierta. Para varias cuentas en el mismo perfil (X, TikTok), agrégalas al selector de cuentas de la red."
        >
          <div className="mb-4 flex flex-wrap gap-1">
            {PRODUCTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setTab(p.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  tab === p.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">Red</th>
                  <th className="pb-2 font-normal">Activa</th>
                  <th className="pb-2 font-normal">Perfil de Chrome</th>
                  <th className="pb-2 font-normal">Cuenta / página esperada</th>
                  <th className="pb-2 font-normal">Notas para el agente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim">
                {PLATFORMS.map((pl) => {
                  const acc = config.accounts[tab][pl.id];
                  return (
                    <tr key={pl.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">{pl.label}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={acc.enabled}
                          onChange={(e) => setAccount(tab, pl.id, { enabled: e.target.checked })}
                          className="accent-[var(--primary)]"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={acc.profileId}
                          onChange={(e) => setAccount(tab, pl.id, { profileId: e.target.value })}
                          className={cn(inputClass, "py-1.5")}
                        >
                          {config.profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={acc.account}
                          onChange={(e) => setAccount(tab, pl.id, { account: e.target.value })}
                          placeholder={pl.id.startsWith("wa") ? "Número o nombre" : "@cuenta o nombre de página"}
                          className={cn(inputClass, "py-1.5")}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          value={acc.notes}
                          onChange={(e) => setAccount(tab, pl.id, { notes: e.target.value })}
                          placeholder="Opcional"
                          className={cn(inputClass, "py-1.5")}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-4">
            <label className="block text-xs text-muted-foreground">
              Enlace del canal de WhatsApp ({PRODUCTS.find((p) => p.id === tab)?.name})
              <input
                value={config.whatsapp[tab].channelUrl}
                onChange={(e) => update((c) => (c.whatsapp[tab].channelUrl = e.target.value.trim()))}
                placeholder="https://whatsapp.com/channel/…"
                className={cn(inputClass, "mt-1.5")}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Nombre del canal (opcional)
              <input
                value={config.whatsapp[tab].channel}
                onChange={(e) => update((c) => (c.whatsapp[tab].channel = e.target.value))}
                placeholder="Nombre exacto del canal"
                className={cn(inputClass, "mt-1.5")}
              />
            </label>
            </div>
            <label className="block text-xs text-muted-foreground">
              Grupos de WhatsApp (uno por línea, nombre exacto)
              <textarea
                rows={6}
                value={config.whatsapp[tab].groups.join("\n")}
                onChange={(e) =>
                  update(
                    (c) =>
                      (c.whatsapp[tab].groups = e.target.value
                        .split("\n")
                        .map((g) => g.trim())
                        .filter((g, i, arr) => g || i < arr.length - 1)),
                  )
                }
                className={cn(inputClass, "mt-1.5 resize-y")}
              />
            </label>
          </div>
        </Card>
      </div>
    </PublisherShell>
  );
}
