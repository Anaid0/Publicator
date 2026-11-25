import { NextResponse } from "next/server";
import { isPlatformId } from "@/publisher/catalog";
import { getJob } from "@/publisher/job-store";
import { cancelTask, retryTask } from "@/publisher/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ job });
}

/** body: { action: "retry" | "cancel", platform } */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    if (!isPlatformId(body.platform)) throw new Error("Plataforma inválida");
    const job =
      body.action === "retry"
        ? retryTask(id, body.platform)
        : body.action === "cancel"
          ? cancelTask(id, body.platform)
          : null;
    if (!job) throw new Error("Acción inválida");
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
