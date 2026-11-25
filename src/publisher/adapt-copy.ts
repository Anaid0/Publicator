import {
  COPY_LIMITS,
  getPlatform,
  getProduct,
  type PlatformId,
  type ProductId,
} from "./catalog";
import { readConfig } from "./config-store";
import { runClaude } from "./runner";

const GUIDE: Record<PlatformId, string> = {
  tiktok:
    "Descripción de TikTok: primera línea con un gancho fuerte y corto, 1 a 3 frases breves, llamado a la acción claro y 3 a 6 hashtags relevantes al final (incluye el del producto). Emojis con moderación.",
  x: "Post de X: máximo 280 caracteres contando cada enlace como 23 (apunta a 260 para tener margen). Gancho + idea central + llamado a la acción + enlace si el original lo trae. Máximo 2 hashtags. Sin hilos.",
  linkedin:
    "Publicación de página de empresa en LinkedIn: tono profesional y cercano, primera línea que haga detenerse, párrafos cortos separados por línea en blanco, beneficio concreto para empresas o profesionales, llamado a la acción y 3 a 5 hashtags al final.",
  wa_estado:
    "Texto para estado de WhatsApp (pie de la imagen o video): máximo 700 caracteres, conversacional, sin hashtags, una idea y el llamado a la acción con el enlace o número bien visible.",
  wa_canal:
    "Mensaje para canal de WhatsApp: conversacional, sin hashtags, frases cortas, puede usar *negrita* de WhatsApp para el titular, llamado a la acción con enlace o número al final.",
  wa_grupos:
    "Mensaje para grupos de WhatsApp de terceros: respetuoso y útil, que no suene a spam ni a cadena, sin hashtags, presenta el valor en 2 a 4 frases y cierra con una invitación amable y el enlace o número.",
};

export async function adaptCopy(input: {
  product: ProductId;
  copy: string;
  platforms: PlatformId[];
}): Promise<{ copies: Partial<Record<PlatformId, string>>; costUsd?: number }> {
  const product = getProduct(input.product);
  const cfg = readConfig();
  const targets = input.platforms
    .map(
      (p) =>
        `- "${p}" (${getPlatform(p).label}, máx. ${COPY_LIMITS[p]} caracteres): ${GUIDE[p]}`,
    )
    .join("\n");

  const prompt = `Eres el community manager de ${product.name}. Adapta el copy original a cada red indicada.

Reglas:
- Español de Colombia, mismo mensaje y misma oferta. No inventes datos, cifras, precios, promesas ni enlaces.
- Conserva intactos los enlaces, números de teléfono o WhatsApp, correos, palabras clave para comentar (p. ej. "Comenta SALARIO") y las leyendas legales que traiga el original.
- Respeta el límite de caracteres de cada red.
- No uses herramientas: responde solo con texto.

Redes:
${targets}

Copy original:
<<<COPY
${input.copy.trim()}
COPY>>>

Responde ÚNICAMENTE con un bloque \`\`\`json con un objeto cuyas claves sean exactamente ${input.platforms.map((p) => `"${p}"`).join(", ")} y cuyos valores sean el texto final listo para pegar.`;

  const res = await runClaude({
    prompt,
    model: cfg.model,
    allowedTools: [],
    chrome: false,
    timeoutMs: 3 * 60_000,
  });
  if (!res.ok) throw new Error(res.error || "No se pudo adaptar el copy");

  const m = res.resultText.match(/```json\s*([\s\S]*?)```/);
  const raw = m ? m[1] : res.resultText.slice(res.resultText.indexOf("{"));
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("El modelo no devolvió un JSON válido. Intenta de nuevo.");
  }
  const copies: Partial<Record<PlatformId, string>> = {};
  for (const p of input.platforms) {
    if (typeof data[p] === "string" && data[p]) copies[p] = (data[p] as string).trim();
  }
  return { copies, costUsd: res.costUsd };
}
