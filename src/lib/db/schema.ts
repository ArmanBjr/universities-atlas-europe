import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Imported from Wikidata. Wiped and rewritten by `npm run db:seed`. */
export const universities = sqliteTable(
  "universities",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    nativeName: text("native_name"),
    city: text("city"),
    countryCode: text("country_code").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    /** "exact" | "hq" | "city" — see University.coordPrecision. */
    coordPrecision: text("coord_precision").notNull().default("city"),
    kind: text("kind").notNull().default("other"),
    website: text("website"),
    founded: integer("founded"),
    students: integer("students"),
    wikidataId: text("wikidata_id"),
    wikipediaUrl: text("wikipedia_url"),
    source: text("source").notNull().default("wikidata"),
  },
  (t) => [
    uniqueIndex("universities_slug_idx").on(t.slug),
    index("universities_country_idx").on(t.countryCode),
  ],
);

/** Your data. Never touched by an import — seeding preserves these rows. */
export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    universityId: text("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("interested"),
    priority: integer("priority").notNull().default(0),
    notes: text("notes"),
    deadline: text("deadline"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex("applications_university_idx").on(t.universityId)],
);

export const programs = sqliteTable(
  "programs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    universityId: text("university_id")
      .notNull()
      .references(() => universities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    degree: text("degree").notNull().default("master"),
    language: text("language").notNull().default("English"),
    tuitionPerYear: integer("tuition_per_year"),
    durationMonths: integer("duration_months"),
    deadline: text("deadline"),
    url: text("url"),
    requirements: text("requirements"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("programs_university_idx").on(t.universityId)],
);

export type UniversityRow = typeof universities.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
