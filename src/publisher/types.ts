import type { MediaType, PlatformId, ProductId } from "./catalog";

export type TaskStatus =
  | "en_espera" // esperando su hora (WhatsApp o sin antelación suficiente)
  | "en_cola" // lista para ejecutarse
  | "ejecutando"
  | "programado" // quedó programado dentro de la plataforma
  | "publicado"
  | "requiere_accion" // sesión cerrada, 2FA, CAPTCHA, etc.
  | "fallido"
  | "cancelado";

/** "nativo": se programa en la plataforma ya. "a_la_hora": Chrome publica a la hora. */
export type TaskMode = "nativo" | "a_la_hora";

export interface LogEntry {
  at: string;
  text: string;
}

export interface PublishTask {
  platform: PlatformId;
  status: TaskStatus;
  mode: TaskMode;
  /** Cuándo debe ejecutarse el agente (ISO). */
  runAt: string;
  startedAt?: string;
  finishedAt?: string;
  detail?: string;
  url?: string;
  costUsd?: number;
  log: LogEntry[];
}

export interface PublishJob {
  id: string;
  product: ProductId;
  /** Ruta absoluta del archivo en content/. */
  mediaPath: string;
  mediaName: string;
  mediaType: MediaType;
  mediaBytes: number;
  copy: string;
  /** Copy aprobado por red. Si existe, el agente lo usa tal cual. */
  copies?: Partial<Record<PlatformId, string>>;
  /** Fecha local YYYY-MM-DD (siempre el día en curso). */
  date: string;
  /** Hora local HH:mm elegida. */
  time: string;
  /** Fecha-hora objetivo de publicación (ISO). */
  publishAt: string;
  createdAt: string;
  tasks: PublishTask[];
}

export interface ChromeProfile {
  id: string;
  label: string;
  /** deviceId de la extensión Claude in Chrome de ese perfil. */
  deviceId: string;
}

export interface AccountConfig {
  enabled: boolean;
  profileId: string;
  /** Cuenta, página o número esperado (p. ej. @verificaya, "VerificaYA" en LinkedIn). */
  account: string;
  notes: string;
}

export interface WhatsAppConfig {
  /** Nombre exacto del canal (opcional si hay enlace). */
  channel: string;
  /** Enlace de invitación del canal: https://whatsapp.com/channel/... */
  channelUrl: string;
  groups: string[];
}

export interface PublisherConfig {
  /** Modelo de Claude para el agente (alias del CLI: sonnet, opus, haiku…). */
  model: string;
  profiles: ChromeProfile[];
  accounts: Record<ProductId, Record<PlatformId, AccountConfig>>;
  whatsapp: Record<ProductId, WhatsAppConfig>;
}
