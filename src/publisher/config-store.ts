import fs from "node:fs";
import { PLATFORMS, PRODUCTS, type PlatformId, type ProductId } from "./catalog";
import { CONFIG_FILE, DATA_DIR } from "./paths";
import type { AccountConfig, PublisherConfig, WhatsAppConfig } from "./types";

const PROFILE_MAIN = "principal";
const PROFILE_TRAYECTOYA = "trayectoya";

function defaultConfig(): PublisherConfig {
  const accounts = {} as PublisherConfig["accounts"];
  const whatsapp = {} as PublisherConfig["whatsapp"];
  for (const product of PRODUCTS) {
    const perPlatform = {} as Record<PlatformId, AccountConfig>;
    for (const platform of PLATFORMS) {
      perPlatform[platform.id] = {
        enabled: true,
        profileId:
          product.id === "trayectoya" ? PROFILE_TRAYECTOYA : PROFILE_MAIN,
        account: "",
        notes: "",
      };
    }
    accounts[product.id] = perPlatform;
    whatsapp[product.id] = { channel: "", channelUrl: "", groups: [] };
  }
  return {
    model: "sonnet",
    profiles: [
      {
        id: PROFILE_MAIN,
        label: "Perfil principal (NyGsoft, MonkeyJobs, VerificaYA)",
        deviceId: "",
      },
      { id: PROFILE_TRAYECTOYA, label: "Perfil TrayectoYA", deviceId: "" },
    ],
    accounts,
    whatsapp,
  };
}

/** Completa con valores por defecto lo que falte (p. ej. una plataforma nueva). */
function withDefaults(partial: Partial<PublisherConfig>): PublisherConfig {
  const base = defaultConfig();
  const cfg: PublisherConfig = {
    model: partial.model || base.model,
    profiles: partial.profiles?.length ? partial.profiles : base.profiles,
    accounts: base.accounts,
    whatsapp: base.whatsapp,
  };
  for (const product of PRODUCTS) {
    for (const platform of PLATFORMS) {
      const saved = partial.accounts?.[product.id]?.[platform.id];
      if (saved) {
        cfg.accounts[product.id][platform.id] = {
          ...cfg.accounts[product.id][platform.id],
          ...saved,
        };
      }
    }
    const wa: Partial<WhatsAppConfig> | undefined =
      partial.whatsapp?.[product.id];
    if (wa) {
      cfg.whatsapp[product.id] = {
        channel: wa.channel ?? "",
        channelUrl: wa.channelUrl ?? "",
        groups: Array.isArray(wa.groups) ? wa.groups : [],
      };
    }
  }
  return cfg;
}

export function readConfig(): PublisherConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return withDefaults(JSON.parse(raw));
  } catch {
    return defaultConfig();
  }
}

export function writeConfig(cfg: Partial<PublisherConfig>): PublisherConfig {
  const full = withDefaults(cfg);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(full, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
  return full;
}

export function accountFor(
  cfg: PublisherConfig,
  product: ProductId,
  platform: PlatformId,
) {
  const account = cfg.accounts[product][platform];
  const profile = cfg.profiles.find((p) => p.id === account.profileId);
  return { account, profile };
}
