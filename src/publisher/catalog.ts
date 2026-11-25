// Catálogo fijo de productos y plataformas del publicador.
// Lo que cambia por cuenta (perfiles de Chrome, cuentas, grupos) vive en
// data/publicador.json y se edita desde /publicar/ajustes.

export const PRODUCTS = [
  { id: "verificaya", name: "VerificaYA" },
  { id: "trayectoya", name: "TrayectoYA" },
  { id: "monkeyjobs", name: "MonkeyJobs" },
  { id: "nygsoft", name: "NyGsoft" },
] as const;

export type ProductId = (typeof PRODUCTS)[number]["id"];

export type MediaType = "image" | "video";

export const PLATFORMS = [
  {
    id: "tiktok",
    label: "TikTok",
    nativeSchedule: true,
    url: "https://www.tiktok.com/tiktokstudio/upload",
  },
  {
    id: "x",
    label: "X",
    nativeSchedule: true,
    url: "https://x.com/compose/post",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    nativeSchedule: true,
    url: "https://www.linkedin.com/feed/",
  },
  {
    id: "wa_estado",
    label: "WhatsApp · Estado",
    nativeSchedule: false,
    url: "https://web.whatsapp.com/",
  },
  {
    id: "wa_canal",
    label: "WhatsApp · Canal",
    nativeSchedule: false,
    url: "https://web.whatsapp.com/",
  },
  {
    id: "wa_grupos",
    label: "WhatsApp · Grupos",
    nativeSchedule: false,
    url: "https://web.whatsapp.com/",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  nativeSchedule: boolean;
  url: string;
}[];

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as PlatformId[];

export function getPlatform(id: PlatformId) {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`Plataforma desconocida: ${id}`);
  return p;
}

export function getProduct(id: ProductId) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) throw new Error(`Producto desconocido: ${id}`);
  return p;
}

export function isProductId(v: unknown): v is ProductId {
  return PRODUCTS.some((p) => p.id === v);
}

export function isPlatformId(v: unknown): v is PlatformId {
  return PLATFORMS.some((p) => p.id === v);
}

/** Minutos mínimos de antelación para programar dentro de la plataforma. */
export const NATIVE_SCHEDULE_MIN_LEAD_MINUTES = 20;

/** Límite de la herramienta file_upload de Claude in Chrome. */
export const CHROME_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

/** Límite de caracteres que usamos para cada red al adaptar el copy. */
export const COPY_LIMITS: Record<PlatformId, number> = {
  tiktok: 2200,
  x: 280,
  linkedin: 3000,
  wa_estado: 700,
  wa_canal: 4000,
  wa_grupos: 4000,
};

/** Largo de un texto como lo cuenta X (cada enlace vale 23). */
export function xLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

export function copyLength(platform: PlatformId, text: string): number {
  return platform === "x" ? xLength(text) : text.length;
}
