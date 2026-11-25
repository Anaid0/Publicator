import { NextResponse } from "next/server";
import { adaptCopy } from "@/publisher/adapt-copy";
import { isPlatformId, isProductId } from "@/publisher/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** body: { product, copy, platforms[] } → { copies: { [platform]: texto } } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isProductId(body.product)) throw new Error("Producto inválido");
    const copy = String(body.copy ?? "").trim();
    if (!copy) throw new Error("Escribe primero el copy original");
    const platforms = Array.isArray(body.platforms)
      ? body.platforms.filter(isPlatformId)
      : [];
    if (!platforms.length) throw new Error("Elige al menos una plataforma");
    return NextResponse.json(
      await adaptCopy({ product: body.product, copy, platforms }),
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
