/**
 * Loads data/universities.json into SQLite.
 *
 * Institutions are upserted and then reconciled: anything that has disappeared
 * from the import is deleted, because the importer's filters get stricter over
 * time and an upsert-only seed would leave every record it has ever imported in
 * the database permanently. That is how a few hundred girls' grammar schools
 * would keep appearing on the map long after the importer stopped emitting them.
 *
 * The one exception is an institution you are tracking. Deleting that would take
 * your notes and status with it, so tracked records survive reconciliation even
 * when the import drops them, and the count is reported rather than hidden.
 */
import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { University } from "../src/lib/types.ts";

const DB_PATH = path.join(process.cwd(), "data", "app.db");
const JSON_PATH = path.join(process.cwd(), "data", "universities.json");

async function main() {
  const raw = await readFile(JSON_PATH, "utf8").catch(() => {
    throw new Error(`${JSON_PATH} not found — run "npm run data:fetch" first.`);
  });
  const rows = JSON.parse(raw) as University[];

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");

  const insert = db.prepare(`
    INSERT INTO universities
      (id, slug, name, native_name, city, country_code, lat, lng, coord_precision,
       kind, website, founded, students, wikidata_id, wikipedia_url, source)
    VALUES
      (@id, @slug, @name, @nativeName, @city, @countryCode, @lat, @lng, @coordPrecision,
       @kind, @website, @founded, @students, @wikidataId, @wikipediaUrl, @source)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      native_name = excluded.native_name,
      city = excluded.city,
      country_code = excluded.country_code,
      lat = excluded.lat,
      lng = excluded.lng,
      coord_precision = excluded.coord_precision,
      kind = excluded.kind,
      website = excluded.website,
      founded = excluded.founded,
      students = excluded.students,
      wikidata_id = excluded.wikidata_id,
      wikipedia_url = excluded.wikipedia_url
  `);

  // The import is the source of truth for everything it still contains, so the
  // id list is passed as JSON and anything outside it goes. `json_each` is used
  // rather than a generated `IN (?, ?, ...)` because SQLite caps a statement at
  // 32k bound parameters and the import is already a quarter of that.
  const deleteMissing = db.prepare(`
    DELETE FROM universities
    WHERE id NOT IN (SELECT value FROM json_each(?))
      AND id NOT IN (SELECT university_id FROM applications)
  `);
  const selectStranded = db.prepare(`
    SELECT id, slug FROM universities
    WHERE id NOT IN (SELECT value FROM json_each(?))
  `);

  // Slugs are unique-indexed and get *permuted* between imports, not just added
  // and removed: two Corpus Christi Colleges swap which one carries the "-2"
  // suffix, and institutions whose names transliterate to nothing fall back to
  // "ua-institution-N" and renumber whenever the set changes. A swap means both
  // rows exist at once, so no ordering of insert and delete avoids the clash —
  // every slug has to be freed before any is reassigned. The colon is what makes
  // the interim value safe: importer slugs never contain one, and the id is
  // already unique.
  const freeSlugs = db.prepare(`UPDATE universities SET slug = 'pending:' || id`);
  const setSlug = db.prepare(`UPDATE universities SET slug = ? WHERE id = ?`);

  // Upsert and reconcile together: a crash between the two would otherwise
  // leave the map showing a mix of two imports.
  const run = db.transaction((items: University[]) => {
    const ids = JSON.stringify(items.map((u) => u.id));

    const removed = deleteMissing.run(ids).changes;
    // Whatever is still missing from the import survived the delete above, so
    // it is tracked. Read it before the slugs are cleared.
    const stranded = selectStranded.all(ids) as { id: string; slug: string }[];

    freeSlugs.run();
    for (const u of items) insert.run(u);

    // Tracked-but-dropped rows were not in the upsert, so they are still
    // holding the interim slug. Hand back the one they had, unless the import
    // has since claimed it.
    const taken = new Set(items.map((u) => u.slug));
    for (const s of stranded) {
      let slug = s.slug;
      for (let n = 2; taken.has(slug); n++) slug = `${s.slug}-${n}`;
      taken.add(slug);
      setSlug.run(slug, s.id);
    }
    return { removed, stranded: stranded.length };
  });
  const { removed, stranded } = run(rows);

  db.pragma("foreign_keys = ON");
  const count = db.prepare("SELECT COUNT(*) AS n FROM universities").get() as { n: number };
  const kept = db.prepare("SELECT COUNT(*) AS n FROM applications").get() as { n: number };
  db.close();

  console.log(`Seeded ${rows.length} records — ${count.n} universities in DB, ${kept.n} applications preserved.`);
  if (removed) console.log(`Removed ${removed} no longer in the import.`);
  if (stranded) {
    console.log(
      `Kept ${stranded} that the import dropped but you are tracking — they stay on the map until you untrack them.`,
    );
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
