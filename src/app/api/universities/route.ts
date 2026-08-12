import { NextResponse } from "next/server";
import { getMapPoints } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** Every point on the map, trimmed. Filtering happens client-side. */
export function GET() {
  try {
    const points = getMapPoints();
    return NextResponse.json(
      { success: true, data: points, meta: { total: points.length } },
      // Points only change when you re-import or change a status, so a short
      // private cache is safe and makes back-navigation instant.
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (err) {
    console.error("GET /api/universities failed:", err);
    return NextResponse.json(
      { success: false, data: null, error: "Could not load universities." },
      { status: 500 },
    );
  }
}
