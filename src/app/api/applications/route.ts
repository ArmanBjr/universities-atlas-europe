import { NextResponse } from "next/server";
import { setApplicationStatus, updateApplicationNotes } from "@/lib/db/queries";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_NOTES = 4000;

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && (APPLICATION_STATUSES as string[]).includes(v);
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status: 400 });
}

/** Sets or clears the tracked status for one university. */
export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON.");
  }

  const { universityId, status } = (body ?? {}) as {
    universityId?: unknown;
    status?: unknown;
  };

  if (typeof universityId !== "string" || !/^Q\d+$/.test(universityId)) {
    return badRequest("universityId must be a Wikidata QID.");
  }
  if (status !== null && !isStatus(status)) {
    return badRequest(`status must be null or one of: ${APPLICATION_STATUSES.join(", ")}.`);
  }

  try {
    const application = setApplicationStatus(universityId, status);
    return NextResponse.json({ success: true, data: application, error: null });
  } catch (err) {
    // A missing university is the caller's mistake, not a server fault.
    if (err instanceof Error && err.message.startsWith("Unknown university")) {
      return badRequest(err.message);
    }
    console.error("PUT /api/applications failed:", err);
    return NextResponse.json(
      { success: false, data: null, error: "Could not save that status." },
      { status: 500 },
    );
  }
}

/** Updates notes, deadline or priority on an already-tracked university. */
export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON.");
  }

  const { universityId, notes, deadline, priority } = (body ?? {}) as Record<string, unknown>;

  if (typeof universityId !== "string" || !/^Q\d+$/.test(universityId)) {
    return badRequest("universityId must be a Wikidata QID.");
  }

  const patch: { notes?: string | null; deadline?: string | null; priority?: number } = {};

  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") return badRequest("notes must be a string or null.");
    if (typeof notes === "string" && notes.length > MAX_NOTES) {
      return badRequest(`notes must be under ${MAX_NOTES} characters.`);
    }
    patch.notes = notes as string | null;
  }

  if (deadline !== undefined) {
    if (deadline !== null && (typeof deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deadline))) {
      return badRequest("deadline must be YYYY-MM-DD or null.");
    }
    patch.deadline = deadline as string | null;
  }

  if (priority !== undefined) {
    if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 5) {
      return badRequest("priority must be an integer between 0 and 5.");
    }
    patch.priority = priority;
  }

  if (Object.keys(patch).length === 0) return badRequest("Nothing to update.");

  try {
    const application = updateApplicationNotes(universityId, patch);
    if (!application) {
      return badRequest("Track this university before adding notes.");
    }
    return NextResponse.json({ success: true, data: application, error: null });
  } catch (err) {
    console.error("PATCH /api/applications failed:", err);
    return NextResponse.json(
      { success: false, data: null, error: "Could not save your changes." },
      { status: 500 },
    );
  }
}
