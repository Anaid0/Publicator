import { getPlatform, getProduct, type PlatformId } from "./catalog";
import type {
  AccountConfig,
  ChromeProfile,
  PublishJob,
  PublishTask,
  WhatsAppConfig,
} from "./types";

/** Slug de la página de LinkedIn: de "VerificaYa (página de empresa)" → "verificaya". */
function linkedinSlug(account: string, product: string): string {
  const m = account.match(/linkedin\.com\/company\/([^/\s]+)/i);
  if (m) return m[1];
  const base = (account.split("(")[0] || product).trim().toLowerCase();
  return base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "") || product;
}

interface PromptInput {
  job: PublishJob;
  task: PublishTask;
  account: AccountConfig;
  profile: ChromeProfile;
  whatsapp: WhatsAppConfig;
}

// Script que impide que la página abra el selector de archivos de macOS (bloquea
// la extensión): intercepta input.click()/showPicker() y los clics del usuario
// sobre inputs o labels de archivo, y deja esos inputs visibles para file_upload.
const ARM_FILE_CAPTURE = `(() => {
  const P = (window.__publicador = window.__publicador || { inputs: [] });
  const reveal = (el) => {
    if (!el || el.type !== 'file') return;
    if (!P.inputs.includes(el)) P.inputs.push(el);
    if (!el.isConnected) document.body.appendChild(el);
    const i = P.inputs.indexOf(el);
    el.setAttribute('aria-label', 'publicador-archivo-' + i);
    el.removeAttribute('hidden');
    el.style.cssText = 'display:block!important;visibility:visible!important;opacity:1!important;position:fixed!important;top:' + (8 + i * 44) + 'px!important;left:8px!important;width:240px!important;height:36px!important;z-index:2147483647!important;';
  };
  if (!P.armed) {
    P.armed = true;
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') { reveal(this); return; }
      return origClick.call(this);
    };
    if (HTMLInputElement.prototype.showPicker) {
      const origPicker = HTMLInputElement.prototype.showPicker;
      HTMLInputElement.prototype.showPicker = function () {
        if (this.type === 'file') { reveal(this); return; }
        return origPicker.call(this);
      };
    }
    const origDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (this instanceof HTMLInputElement && this.type === 'file' && ev && ev.type === 'click') { reveal(this); return true; }
      return origDispatch.call(this, ev);
    };
    document.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const lbl = t.closest('label');
      const inp = t.closest('input[type=file]') || (lbl && lbl.control && lbl.control.type === 'file' ? lbl.control : null);
      if (inp) { e.preventDefault(); reveal(inp); }
    }, true);
  }
  const walk = (root) => {
    root.querySelectorAll('input[type=file]').forEach(reveal);
    root.querySelectorAll('*').forEach((n) => n.shadowRoot && walk(n.shadowRoot));
  };
  walk(document);
  return P.inputs.map((el, i) => ({ i, id: el.id, accept: el.accept, multiple: el.multiple, enDocumento: el.isConnected }));
})()`;

const UPLOAD_PROCEDURE = `## Cómo subir el archivo (obligatorio)
El selector de archivos de macOS BLOQUEA el navegador y deja la tarea colgada. En varias redes (p. ej. LinkedIn) el selector se abre APENAS pulsas el ícono de foto/multimedia, sin botón intermedio. Por eso la protección se instala ANTES de tocar cualquier ícono o botón de foto, video, multimedia o subir:
  1. Abre el editor de la publicación (o la página de subida) y, ANTES de hacer clic en ningún ícono/botón de foto, video, multimedia o subir, ejecuta ESTE script sin modificarlo con javascript_tool en la pestaña:
\`\`\`js
${ARM_FILE_CAPTURE}
\`\`\`
  2. Ahora sí haz clic en el ícono de foto/multimedia (y si aparece, en "Cargar desde el ordenador" / "Subir" / "Seleccionar archivo"). Con la protección activa NO se abre el selector de macOS: el input de la página queda visible arriba a la izquierda.
  3. Ejecuta de nuevo el mismo script: devuelve la lista de inputs (debe tener al menos uno). Si está vacía, espera 2 s (acción wait) y repite (máx. 3 veces).
  4. Usa find con "file input publicador-archivo-N" (el que acepte imágenes o videos según el archivo) para obtener su ref y llama a file_upload con esa ref, el tabId y la ruta del archivo.
  5. Toma una captura y comprueba que aparece la vista previa del archivo. Si tras 3 intentos no aparece, termina con estado "fallido" explicando en qué paso falló. No publiques sin el archivo.
Prohibido: escribir tu propio JavaScript que llame a .click(), .showPicker() o dispatchEvent sobre inputs de archivo, y tocar íconos o botones de foto/subir ANTES de ejecutar el script. Si la página recarga o navegas a otra, ejecuta el script de nuevo antes de tocar esos íconos. Si aun así aparece una ventana del sistema para elegir archivos, pulsa Escape.`;

/** Script que pega el texto en el campo enfocado de WhatsApp sin pulsar Enter. */
function waPasteScript(text: string): string {
  return `(() => {
  const text = ${JSON.stringify(text)};
  const el = document.activeElement;
  if (!el || !el.isContentEditable) return 'ERROR: haz clic primero en el campo de texto (pie o mensaje)';
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  return 'ok: ' + (el.innerText || '').length + ' caracteres en el campo';
})()`;
}

function waTextRules(text: string): string {
  return `## Cómo escribir el texto en WhatsApp (OBLIGATORIO)
En WhatsApp la tecla Enter ENVÍA el mensaje. NUNCA escribas el texto con la acción type si tiene saltos de línea: cada línea saldría como un mensaje aparte.
1. Primero adjunta el archivo. En la vista previa, haz clic en el campo "Añade un comentario" / pie de foto para enfocarlo.
2. Ejecuta este script con javascript_tool (pega el texto completo con sus saltos de línea, sin enviar):
\`\`\`js
${waPasteScript(text)}
\`\`\`
3. Toma una captura y comprueba que el texto completo quedó en el pie de la imagen. Si el script devolvió ERROR o el campo quedó vacío, vuelve a hacer clic en el pie y repítelo una vez. Si sigue fallando, escribe el texto con type línea por línea y entre líneas pulsa la tecla "shift+Enter" (nunca Enter solo).
4. Envía UNA sola vez con el botón de enviar de la vista previa. El resultado debe ser un único mensaje: la imagen con todo el texto como pie.`;
}

const RESULT_CONTRACT = `
## Respuesta final (obligatoria)
Termina SIEMPRE con un único bloque \`\`\`json con esta forma y nada después:
\`\`\`json
{"estado": "programado" | "publicado" | "requiere_accion" | "fallido", "detalle": "qué hiciste o qué falta, en una o dos frases", "url": "enlace a la publicación o \\"\\" si no hay"}
\`\`\`
- "programado": quedó programada dentro de la plataforma y la viste en la lista de programados.
- "publicado": quedó publicada y la viste publicada.
- "requiere_accion": hace falta una persona (sesión cerrada, cuenta equivocada sin forma de cambiar, 2FA, CAPTCHA, aviso de spam, verificación, permisos).
- "fallido": cualquier otro error que te impidió terminar.`;

function platformSteps(
  platform: PlatformId,
  input: PromptInput,
  copyBlock: string,
  exact: boolean,
): string {
  const { job, task, whatsapp } = input;
  const native = task.mode === "nativo";
  const when = native
    ? `Programa la publicación para HOY ${job.date} a las ${job.time} (hora local de este computador). No la publiques de inmediato.`
    : "Publica AHORA (esta plataforma no permite programar o ya es la hora).";
  const media = job.mediaType === "video" ? "el video" : "la imagen";

  switch (platform) {
    case "tiktok":
      return `## Pasos en TikTok
1. Abre https://www.tiktok.com/tiktokstudio/upload
2. Sube ${media} siguiendo "Cómo subir el archivo". ${job.mediaType === "image" ? "TikTok acepta fotos (modo foto); si la interfaz solo acepta video, termina con requiere_accion explicándolo." : ""}
3. En la descripción pega ${exact ? "el texto aprobado tal cual" : "el copy (ver abajo). Si supera el límite de caracteres, recórtalo conservando el gancho, el llamado a la acción y los hashtags principales"}.
4. ${when}${native ? ' Usa la opción "Programar" / "Schedule" de TikTok Studio.' : ""}
5. Confirma y verifica en "Publicaciones" (o "Programadas") de TikTok Studio que aparece.
${copyBlock}`;
    case "x":
      return `## Pasos en X
1. Abre https://x.com/compose/post
2. Escribe el texto. ${exact ? "Usa el texto aprobado tal cual (ya cabe en 280 caracteres)." : "X permite 280 caracteres (cada enlace cuenta 23): si el copy es más largo, resúmelo conservando el gancho, el llamado a la acción, el enlace y máximo 2 hashtags. No inventes datos."}
3. Adjunta ${media} siguiendo "Cómo subir el archivo".
4. ${when}${native ? " Usa el ícono de programar (calendario/reloj) del composer, elige la fecha y hora, confirma y luego pulsa \"Programar\"." : ""}
5. Verifica: ${native ? "en Programados (x.com/compose/post/unsent/scheduled) debe aparecer." : "abre tu perfil y comprueba que el post aparece; copia su URL."}
${copyBlock}`;
    case "linkedin":
      return `## Pasos en LinkedIn (sigue EXACTAMENTE este orden; no improvises ni explores)
1. Navega a https://www.linkedin.com/company/${linkedinSlug(input.account.account, job.product)}/ y espera 4 s: LinkedIn redirige al panel de administrador "/company/<número>/admin/dashboard/". Si no hay acceso de administrador, termina con requiere_accion.
2. Toma el número de la URL y navega a https://www.linkedin.com/company/<número>/admin/page-posts/published/?share=true y espera 4 s: se abre el editor "Crear publicación" con el nombre de la página arriba. Comprueba con una captura que el autor es la página y no una persona.
3. Haz clic en el área de texto "¿Sobre qué quieres hablar?" y escribe ${exact ? "el texto aprobado tal cual" : "el copy completo"}.
4. ANTES de tocar el ícono de imagen, ejecuta el script de "Cómo subir el archivo" con javascript_tool.
5. Haz clic en el ícono de imagen (primer ícono de la fila inferior del editor). Se abre el modal "Editor" con "Selecciona archivos para empezar". No pulses "Cargar desde el ordenador".
6. Ejecuta otra vez el mismo script. Debe listar un input con id "media-editor-file-selector__file-input".
7. Usa find con "file input publicador-archivo-0" y llama a file_upload con esa ref y la ruta del archivo.
8. Toma una captura: debe verse la imagen en el Editor. Pulsa "Siguiente" para volver al editor de texto con la imagen adjunta.
9. ${when}${native ? " Usa el ícono de reloj \"Programar\" junto al botón Publicar, elige fecha y hora y confirma." : " Pulsa \"Publicar\"."}
10. Verifica: ${native ? "en \"Ver todas las publicaciones programadas\" debe aparecer." : "en la pestaña de publicaciones de la página debe verse la nueva publicación; copia su URL."}
PROHIBIDO en LinkedIn: read_page (la página es enorme y se cuelga), explorar o entrar en iframes, escribir JavaScript propio distinto del script dado, y pulsar "Cargar desde el ordenador".
${copyBlock}`;
    case "wa_estado":
      return `## Pasos en WhatsApp Web · Estado
1. Abre https://web.whatsapp.com/ (ya vinculada en este perfil). Si pide escanear un QR, termina con requiere_accion.
2. Ve a "Estados" / "Updates" → añadir estado → foto o video.
3. Sube ${media} siguiendo "Cómo subir el archivo".
4. Pon el texto como pie siguiendo "Cómo escribir el texto en WhatsApp" (el texto ya viene preparado en el script).
5. Verifica que aparece en "Mi estado" como UN solo estado con el texto completo.
${copyBlock}`;
    case "wa_canal":
      return `## Pasos en WhatsApp Web · Canal
1. Abre https://web.whatsapp.com/ (ya vinculada en este perfil). Si pide escanear un QR, termina con requiere_accion.
2. Identifica el canal: ${
        whatsapp.channelUrl
          ? `es el del enlace ${whatsapp.channelUrl}${whatsapp.channel ? ` (nombre: "${whatsapp.channel}")` : ""}. ${whatsapp.channel ? "" : "Si no conoces el nombre, abre ese enlace en una pestaña aparte SOLO para leer el nombre del canal con get_page_text (NO pulses \"Ver canal\", \"Abrir app\" ni \"Seguir\": pueden abrir diálogos del sistema) y ciérrala. "}`
          : whatsapp.channel
            ? `"${whatsapp.channel}". `
            : "el canal del producto que administra esta cuenta. "
      }En WhatsApp Web ve a "Canales" (ícono de canales en la barra izquierda) y abre ese canal desde "Canales que administras" o buscándolo por nombre. Comprueba que eres administrador (debe verse la caja para escribir mensajes). Si no existe o no eres administrador, termina con requiere_accion.
3. En la caja de escribir del canal pulsa el clip/"+" → "Fotos y videos" y adjunta ${media} siguiendo "Cómo subir el archivo".
4. Pon el texto como pie siguiendo "Cómo escribir el texto en WhatsApp" y envía una sola vez.
5. Verifica que en el canal aparece UN solo mensaje nuevo: la imagen con todo el texto como pie.
${copyBlock}`;
    case "wa_grupos": {
      const groups = whatsapp.groups.filter(Boolean);
      const list = groups.length
        ? groups.map((g, i) => `${i + 1}. ${g}`).join("\n")
        : "(no hay grupos configurados)";
      return `## Pasos en WhatsApp Web · Grupos
${groups.length ? "" : "No hay grupos configurados para este producto: termina de inmediato con requiere_accion pidiendo configurarlos en Ajustes.\n"}
Grupos destino (busca cada uno por su nombre exacto en la barra de búsqueda de chats):
${list}

Para CADA grupo:
1. Abre el chat del grupo. Si no lo encuentras o no puedes escribir (solo admins), anótalo y sigue con el siguiente.
2. Adjunta ${media} siguiendo "Cómo subir el archivo" y pon el texto como pie siguiendo "Cómo escribir el texto en WhatsApp" (ejecuta el script en cada grupo, con el pie enfocado).
3. Envía una sola vez y comprueba que quedó UN mensaje (imagen + pie) enviado.
4. Espera entre 20 y 40 segundos (acción wait) antes del siguiente grupo para no parecer spam.

Si WhatsApp muestra un aviso de spam o de restricción, detente y termina con requiere_accion.
En "detalle" lista cuántos grupos quedaron enviados y cuáles fallaron (y por qué). Usa "publicado" si al menos uno quedó enviado.
${copyBlock}`;
    }
  }
}

export function buildPrompt(input: PromptInput): string {
  const { job, task, account, profile } = input;
  const product = getProduct(job.product);
  const platform = getPlatform(task.platform);

  const approved = job.copies?.[task.platform]?.replace(/\r\n?/g, "\n").trim();
  const isWa = task.platform.startsWith("wa_");
  const waText = (approved ?? job.copy.replace(/\r\n?/g, "\n"))
    .replace(isWa && !approved ? /(^|\s)#[\p{L}\p{N}_]+/gu : /$^/, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  const waFinal =
    task.platform === "wa_estado" && !approved && waText.length > 700
      ? waText.slice(0, 700).replace(/\n[^\n]*$/, "").trim()
      : waText;
  const copyBlock = approved
    ? `
## Texto aprobado para ${platform.label}
Úsalo EXACTAMENTE como está: no cambies, recortes ni agregues palabras, emojis ni hashtags. Respeta los saltos de línea.
<<<COPY
${approved}
COPY>>>`
    : `
## Copy original
<<<COPY
${job.copy.trim() || "(sin copy: publica solo el archivo)"}
COPY>>>`;

  return `Eres el publicador de redes sociales de ${product.name}. Trabajas SOLO con las herramientas de Claude in Chrome. Tu tarea: publicar en ${platform.label} el archivo y el copy que se indican.

## Datos
- Producto: ${product.name}
- Plataforma: ${platform.label}
- Cuenta esperada: ${account.account || `(la de ${product.name}; compruébalo por el nombre de la cuenta)`}
- Archivo (${job.mediaType === "video" ? "video" : "imagen"}): ${job.mediaPath}
- Hoy: ${job.date} · hora elegida: ${job.time}
${account.notes ? `- Notas de esta cuenta: ${account.notes}\n` : ""}
## Reglas
1. Navegador: llama primero a select_browser con deviceId "${profile.deviceId}" (perfil "${profile.label}"). No uses otro navegador. Si falla, termina con requiere_accion.
2. ${task.platform.startsWith("wa_") ? "WhatsApp Web solo funciona en una pestaña a la vez. Llama a tabs_context_mcp: si ya tienes acceso a una pestaña de web.whatsapp.com, úsala y NO la cierres al terminar. Si no, crea una pestaña nueva con tabs_create_mcp, abre https://web.whatsapp.com/ y, si aparece \"WhatsApp está abierto en otra ventana\", pulsa \"Usar aquí\"; al terminar cierra solo esa pestaña." : "Crea una pestaña NUEVA con tabs_create_mcp y trabaja solo en ella; no toques las demás pestañas. Ciérrala al terminar."}
3. Verifica la sesión: la cuenta abierta en ${platform.label} debe ser la de ${product.name}. Si hay otra cuenta y la correcta está en el selector de cuentas de la plataforma, cámbiate a ella. NUNCA escribas contraseñas ni códigos: si no hay sesión o la cuenta correcta no está disponible, termina con requiere_accion indicando en qué perfil hay que iniciar sesión.
4. Si aparece 2FA, CAPTCHA, verificación de identidad o aviso de spam, detente y termina con requiere_accion.
5. Subir el archivo: sigue EXACTAMENTE el procedimiento "Cómo subir el archivo" de abajo.
6. Publica una sola vez. Antes de confirmar, revisa que el archivo y el texto están bien. Si algo ya quedó publicado o programado con este mismo archivo hoy, no lo dupliques: repórtalo.
7. Acepta solo los diálogos propios del flujo de publicar; rechaza cookies no esenciales.

${UPLOAD_PROCEDURE}

${platformSteps(task.platform, input, copyBlock, Boolean(approved))}
${isWa ? waTextRules(waFinal) : ""}
${RESULT_CONTRACT}`;
}
