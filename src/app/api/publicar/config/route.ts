import { NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/publisher/config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ config: readConfig() });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json({ config: writeConfig(body.config ?? body) });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
