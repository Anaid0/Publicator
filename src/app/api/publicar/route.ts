import { NextResponse } from "next/server";
import { isPlatformId, isProductId } from "@/publisher/catalog";
import { listJobs } from "@/publisher/job-store";
import { localDate } from "@/publisher/paths";
import { createJob } from "@/publisher/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publicaciones de hoy (y las de días anteriores con tareas abiertas). */
export async function GET() {
  const today = localDate();
  const jobs = listJobs().filter(
    (j) =>
      j.date === today ||
      j.tasks.some((t) =>
        ["en_espera", "en_cola", "ejecutando"].includes(t.status),
      ),
  );
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const product = form.get("product");
    const file = form.get("file");
    const time = String(form.get("time") ?? "");
    const copy = String(form.get("copy") ?? "");
    const platforms = form.getAll("platforms").map(String);
    const copiesRaw = String(form.get("copies") ?? "{}");
    const copies: Record<string, string> = {};
    for (const [k, v] of Object.entries(JSON.parse(copiesRaw || "{}"))) {
      if (isPlatformId(k) && typeof v === "string") copies[k] = v;
    }

    if (!isProductId(product)) throw new Error("Producto inválido");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Carga una imagen o un video");
    }
    if (!platforms.every(isPlatformId)) throw new Error("Plataforma inválida");

    const job = createJob({
      product,
      time,
      copy,
      copies,
      platforms: platforms.filter(isPlatformId),
      file: {
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    });
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
