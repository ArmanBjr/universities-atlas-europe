import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { applications, programs, universities } from "./schema";
import { COUNTRY_BY_CODE } from "../countries";
import type {
  Application,
  ApplicationStatus,
  CoordPrecision,
  InstitutionKind,
  MapPoint,
  Program,
  UniversityDetail,
} from "../types";

/**
 * The map needs every point at once for clustering to be meaningful, but the
 * full row is ~20x larger than what a dot on a canvas actually uses. This
 * projection is the difference between a ~600KB payload and a ~12MB one.
 */
export function getMapPoints(): MapPoint[] {
  const rows = db
    .select({
      id: universities.id,
      name: universities.name,
      lat: universities.lat,
      lng: universities.lng,
      countryCode: universities.countryCode,
      kind: universities.kind,
      status: applications.status,
    })
    .from(universities)
    .leftJoin(applications, eq(applications.universityId, universities.id))
    .all();

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    countryCode: r.countryCode,
    kind: r.kind as InstitutionKind,
    status: (r.status as ApplicationStatus | null) ?? null,
  }));
}

/** Full record for the detail panel, including country policy and your notes. */
export function getUniversity(id: string): UniversityDetail | null {
  const row = db.select().from(universities).where(eq(universities.id, id)).get();
  if (!row) return null;

  const country = COUNTRY_BY_CODE[row.countryCode];
  if (!country) return null;

  const application = db
    .select()
    .from(applications)
    .where(eq(applications.universityId, id))
    .get();

  const programRows = db
    .select()
    .from(programs)
    .where(eq(programs.universityId, id))
    .all();

  return {
    ...row,
    kind: row.kind as InstitutionKind,
    coordPrecision: row.coordPrecision as CoordPrecision,
    source: row.source as UniversityDetail["source"],
    country,
    application: (application as Application | undefined) ?? null,
    programs: programRows as Program[],
  };
}

/** Drives the "N tracked" counters in the filter panel. */
export function getStatusCounts(): Record<string, number> {
  const rows = db
    .select({ status: applications.status, n: sql<number>`COUNT(*)` })
    .from(applications)
    .groupBy(applications.status)
    .all();
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function getTotals(): { universities: number; countries: number } {
  const u = db.select({ n: sql<number>`COUNT(*)` }).from(universities).get();
  const c = db
    .select({ n: sql<number>`COUNT(DISTINCT ${universities.countryCode})` })
    .from(universities)
    .get();
  return { universities: u?.n ?? 0, countries: c?.n ?? 0 };
}

/**
 * One application row per university, so this upserts rather than inserts.
 * Passing `status: null` clears tracking entirely.
 */
export function setApplicationStatus(
  universityId: string,
  status: ApplicationStatus | null,
): Application | null {
  const exists = db.select({ id: universities.id }).from(universities).where(eq(universities.id, universityId)).get();
  if (!exists) throw new Error(`Unknown university: ${universityId}`);

  if (status === null) {
    db.delete(applications).where(eq(applications.universityId, universityId)).run();
    return null;
  }

  const now = new Date().toISOString();
  db.insert(applications)
    .values({ universityId, status, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: applications.universityId,
      set: { status, updatedAt: now },
    })
    .run();

  return db.select().from(applications).where(eq(applications.universityId, universityId)).get() as Application;
}

export function updateApplicationNotes(
  universityId: string,
  patch: { notes?: string | null; deadline?: string | null; priority?: number },
): Application | null {
  const current = db.select().from(applications).where(eq(applications.universityId, universityId)).get();
  if (!current) return null;

  db.update(applications)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(applications.universityId, universityId))
    .run();

  return db.select().from(applications).where(eq(applications.universityId, universityId)).get() as Application;
}
