import { NextResponse } from "next/server";
import { getUniversity } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!/^Q\d+$/.test(id)) {
    return NextResponse.json(
      { success: false, data: null, error: "Malformed university id." },
      { status: 400 },
    );
  }

  try {
    const university = getUniversity(id);
    if (!university) {
      return NextResponse.json(
        { success: false, data: null, error: "University not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: university, error: null });
  } catch (err) {
    console.error(`GET /api/universities/${id} failed:`, err);
    return NextResponse.json(
      { success: false, data: null, error: "Could not load that university." },
      { status: 500 },
    );
  }
}
