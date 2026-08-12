/**
 * Pulls higher-education institutions in the configured European countries from
 * Wikidata and writes data/universities.json.
 *
 * The endpoint client, the pinned country QIDs and the class tree live in
 * ./wikidata-core.ts, shared with the diagnostic scripts so a diagnosis can
 * never disagree with what the importer actually queried.
 *
 * Five things this importer has to work around, all found by trial:
 *
 *  1. Country lookup by ISO code is a trap. `?c wdt:P297 "NL"` resolves to
 *     Kingdom of the Netherlands (Q29999), but Dutch universities carry
 *     P17 = Netherlands (Q55) — the naive query returned 4 institutions for the
 *     whole country. QIDs are pinned in COUNTRY_QIDS instead.
 *
 *  2. Direct `wdt:P31` misses nearly everything, because institutions are typed
 *     with subclasses ("public research university"), not Q38723 itself. The
 *     subclass tree is therefore required — but `wdt:P31/wdt:P279*` per item
 *     times out on large countries. Materialising the class set in a subquery
 *     first turns a 504 into ~35s.
 *
 *  3. Most institutions have no coordinates of their own: Estonia lists 16
 *     universities but only 1 with P625. We fall back to headquarters, then to
 *     the city centre, and record which was used in `coordPrecision`.
 *
 *  4. Multi-valued properties (several campuses, several websites) multiply
 *     rows, so results are collapsed server-side with GROUP BY + SAMPLE. Core
 *     and enrichment fields are fetched as two lighter queries rather than one
 *     heavy one, because the combined form exceeds the public endpoint's
 *     60s budget on Germany, France and the UK.
 *
 *  5. Secondary schools leak in. Italy's first run returned 3419 "institutions",
 *     mostly licei and istituti tecnici: Italian editors type them with classes
 *     that also sit under Q38723, so a name denylist never catches them all.
 *     They are cut by subtree in wikidata-core's EXCLUDED_SUBTREES instead.
 *
 *   npm run data:fetch            # all countries
 *   npm run data:fetch -- DE NL   # just these, merged into existing output
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { EUROPEAN_COUNTRY_CODES } from "../src/lib/countries.ts";
import type { InstitutionKind, University } from "../src/lib/types.ts";
import {
  LOCAL_LANG,
  countryValues,
  resolveClasses,
  sparql,
  type Binding,
} from "./wikidata-core.ts";

const OUT = path.join(process.cwd(), "data", "universities.json");

/** Step 1: just the QIDs. Cheap enough to survive the endpoint's time budget. */
const idsQuery = (iso: string, classes: string[]) => `
SELECT DISTINCT ?item WHERE {
  ${countryValues(iso)}
  VALUES ?type { ${classes.map((c) => `wd:${c}`).join(" ")} }
  ?item wdt:P31 ?type ; wdt:P17 ?country .
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
}`;

/**
 * Step 2: hydrate a known batch of items. Anchoring on an explicit VALUES list
 * turns the expensive OPTIONAL joins into direct lookups, so this stays fast
 * even for Germany.
 */
const hydrateQuery = (qids: string[], iso: string) => `
SELECT ?item
       (SAMPLE(?enLabel) AS ?en) (SAMPLE(?locLabel) AS ?loc)
       (SAMPLE(?native) AS ?nativeName)
       (SAMPLE(?coord) AS ?point) (SAMPLE(?prec) AS ?precision)
       (SAMPLE(?cityName) AS ?city) (SAMPLE(?site) AS ?website)
       (SAMPLE(?inc) AS ?inception) (MAX(?stu) AS ?students)
       (SAMPLE(?art) AS ?article)
WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(" ")} }

  OPTIONAL { ?item wdt:P625 ?own }
  OPTIONAL { ?item wdt:P159 ?hqPlace . ?hqPlace wdt:P625 ?hq }
  OPTIONAL {
    ?item wdt:P131 ?cityEntity .
    ?cityEntity wdt:P625 ?cityCoord .
    OPTIONAL { ?cityEntity rdfs:label ?cityName . FILTER(LANG(?cityName) = "en") }
  }
  BIND(COALESCE(?own, ?hq, ?cityCoord) AS ?coord)
  BIND(IF(BOUND(?own), "exact", IF(BOUND(?hq), "hq", "city")) AS ?prec)
  FILTER(BOUND(?coord))

  OPTIONAL { ?item rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }
  OPTIONAL { ?item rdfs:label ?locLabel . FILTER(LANG(?locLabel) = "${LOCAL_LANG[iso] ?? "en"}") }
  OPTIONAL { ?item wdt:P1705 ?native }
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P2196 ?stu }
  OPTIONAL { ?art schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}
GROUP BY ?item`;

const BATCH = 150;

/** "Point(11.5675 48.1497)" -> [lng, lat] */
function parsePoint(wkt: string): [number, number] | null {
  const m = /Point\(\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s*\)/.exec(wkt);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

function slugify(name: string, iso: string): string {
  const base = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${iso.toLowerCase()}-${base || "institution"}`.slice(0, 90);
}

/**
 * Order matters: the first match wins, so the specific patterns (medical,
 * applied sciences) are checked before the catch-all "universit*" stem.
 * Local-language stems are included because ~a third of names never get an
 * English label.
 */
const KIND_RULES: [RegExp, InstitutionKind][] = [
  [/(medical|medicine|m[eé]dic|medizin|health care|health science|pharmac|veterinar|dental)/i, "medical"],
  [/(applied sciences|fachhochschule|hogeschool|ammattikorkeakoulu|yrkeshögskola|hochschule für angewandte)/i, "applied_sciences"],
  [/(music|musik|conservat|konservator|fine arts|kunst|beaux|film|theatre|theater|teatr|design|academy of art|akademie der künste|danc|ballet)/i, "art_music"],
  [/(business|management|commerce|economic|handels|wirtschaft|ökonom|ekonom|école de commerce|business school)/i, "business"],
  [/(technolog|technical|technische|technik|polytech|politec|teknis|teknill|engineer|ingenieur|ingénieur|mining|agricultur|landwirtschaft)/i, "technical"],
  [/(universit|universität|université|università|universidad|uniwersytet|univerzit|universidade|universiteit|ülikool|universitet)/i, "university"],
  [/(hochschule|akademi|academy|académie|accademia|akademia|college|école|escuela|instituto|institut|seminary|seminar)/i, "other"],
];

function inferKind(text: string): InstitutionKind {
  for (const [re, kind] of KIND_RULES) if (re.test(text)) return kind;
  return "other";
}

/**
 * Long tail of non-degree entries that survive the class filters.
 *
 * The Italian terms need explaining. Licei artistici and the evening branches
 * of secondary art institutes ("Liceo Artistico Volterra", "Felice Palma -
 * Corso Serale") are typed Q383092 "art academy" — the same class as the
 * genuine Accademie di Belle Arti — so no subtree exclusion can separate them.
 * These words are safe to match on: a liceo is always upper-secondary, and no
 * degree-awarding institution in Europe has "serale" in its name. Together they
 * remove 110 records, all Italian, none of them typed as a real institution.
 *
 * `girls`, `grammar school` and `minor seminary` are the same story in other
 * languages. All 189 "girls" records are single-sex secondary schools (186 of
 * them British), all 32 "grammar school" records are British selective
 * secondaries, and a petit séminaire is by definition the pre-university stage.
 * No degree-awarding institution in Europe carries any of those phrases.
 *
 * Matching on `I.S.A.` was tried and rejected — it also removes ISA Lille, a
 * legitimate French engineering school.
 */
const DENYLIST =
  /\b(border guard|dog|prison|driving|kindergarten|primary school|secondary school|grammar school|girls|minor seminary|petit s[ée]minaire|seminario minore|liceo|serale|scuola media|istituto tecnico|istituto comprensivo)\b/i;

/**
 * Words that mean opposite things depending on where the institution is, so
 * they cannot go in the global denylist.
 *
 * "High school" is the whole list so far. In Britain it is secondary education
 * — 101 records, from "Wimbledon High School" to "Beth Jacob Grammar School for
 * Girls". Everywhere else the same English string is how Wikidata renders a
 * *tertiary* term: Serbia's `visoka škola` ("High School of Electrical
 * Engineering ... Vocational Studies Belgrade"), Slovenia's `visoka šola`, the
 * Netherlands' `hogeschool` ("Larenstein High School" is Van Hall Larenstein),
 * and the literal translation of France's `école nationale supérieure`
 * ("National High School of Chemical and Technological Engineers" is ENSIACET).
 * Scoping the pattern to GB drops every secondary school and keeps all of them.
 */
const COUNTRY_DENYLIST: Record<string, RegExp> = {
  GB: /\bhigh school\b/i,
};

/**
 * Heritage listings for campus buildings share the institution classes and come
 * through as names like "Akademie Akademiestraße 2; Akademiestraße 4". A street
 * number is the reliable tell.
 */
const LOOKS_LIKE_ADDRESS = /(stra(ß|ss)e|street|road|platz|weg|laan|straat)\s+\d/i;

/**
 * Institutions in overseas territories are legally in-country (Saba is Dutch,
 * Réunion is French) but useless on a map of Europe. The Canaries and Azores
 * sit inside this box deliberately — they are ordinary Schengen study options.
 */
function inEurope(lat: number, lng: number): boolean {
  return lat >= 27 && lat <= 72 && lng >= -32 && lng <= 46;
}

function toInt(v?: string): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * City-derived coordinates stack every institution on one pixel. A deterministic
 * offset (~200m–900m, seeded by QID) keeps them individually clickable without
 * pretending to be a real address — `coordPrecision` records the difference.
 */
function jitter(qid: string, lat: number, lng: number): [number, number] {
  let h = 0;
  for (let i = 0; i < qid.length; i++) h = (h * 31 + qid.charCodeAt(i)) | 0;
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const radius = 0.002 + (((h >>> 9) % 100) / 100) * 0.006;
  return [lat + Math.sin(angle) * radius, lng + Math.cos(angle) * radius * 1.6];
}

async function fetchCountry(iso: string, classes: string[]): Promise<University[]> {
  const idRows = await sparql(idsQuery(iso, classes), `${iso}/ids`);
  const qids = idRows.map((r) => r.item!.value.split("/").pop()!);

  const core: Binding[] = [];
  for (let i = 0; i < qids.length; i += BATCH) {
    const batch = qids.slice(i, i + BATCH);
    core.push(...(await sparql(hydrateQuery(batch, iso), `${iso}/${i}`)));
  }

  const localDeny = COUNTRY_DENYLIST[iso];

  const out: University[] = [];
  for (const row of core) {
    const uri = row.item?.value;
    const name = row.en?.value ?? row.loc?.value;
    const wkt = row.point?.value;
    if (!uri || !name || !wkt) continue;
    if (DENYLIST.test(name) || LOOKS_LIKE_ADDRESS.test(name)) continue;
    if (localDeny?.test(name)) continue;

    const point = parsePoint(wkt);
    if (!point || !inEurope(point[1], point[0])) continue;

    const qid = uri.split("/").pop()!;
    const precision = row.precision?.value === "exact" ? "exact" : row.precision?.value === "hq" ? "hq" : "city";
    let [lng, lat] = point;
    if (precision === "city") [lat, lng] = jitter(qid, lat, lng);

    const city = row.city?.value;
    const inception = row.inception?.value;

    out.push({
      id: qid,
      slug: slugify(name, iso),
      name,
      nativeName: row.nativeName?.value ?? row.loc?.value ?? null,
      city: city && !/^Q\d+$/.test(city) ? city : null,
      countryCode: iso,
      lat,
      lng,
      coordPrecision: precision,
      kind: inferKind(`${name} ${row.nativeName?.value ?? ""}`),
      website: row.website?.value ?? null,
      founded: inception ? toInt(inception.slice(0, 4)) : null,
      students: toInt(row.students?.value),
      wikidataId: qid,
      wikipediaUrl: row.article?.value ?? null,
      source: "wikidata",
    });
  }
  return out;
}

/**
 * Collapses institutions that were emitted once per country.
 *
 * Wikidata gives ESCP Business School six P17 values because it has six
 * campuses, so the per-country loop emits it six times — each time with the
 * *same* coordinate, because P625 is single-valued and gets SAMPLEd. The result
 * is six identical dots, five of them attributed to a country the pin is not
 * in. Country attribution is what drives every tuition, visa and PR figure this
 * app shows, so getting it wrong is not cosmetic.
 *
 * One record per institution is therefore required, and the coordinate is the
 * only trustworthy signal for which country that record belongs to. Each
 * ambiguous institution is assigned the country of the nearest institution that
 * had no ambiguity. With thousands of unambiguous points spread across Europe
 * the nearest one is effectively always in the same country: ESCP's coordinate
 * is in Berlin and resolves to DE, Epitech's is in Paris and resolves to FR.
 *
 * The city label is dropped for these, because it is SAMPLEd independently of
 * the coordinate and routinely disagrees with it — ESCP's Berlin pin arrives
 * labelled "Madrid". Showing no city is better than showing the wrong one.
 */
function dedupeByInstitution(rows: University[]): University[] {
  const groups = new Map<string, University[]>();
  for (const u of rows) {
    const group = groups.get(u.id);
    if (group) group.push(u);
    else groups.set(u.id, [u]);
  }

  const anchors = rows.filter((u) => groups.get(u.id)!.length === 1);
  const nearestCountry = (lat: number, lng: number): string | null => {
    let best: string | null = null;
    let bestD = Infinity;
    for (const a of anchors) {
      const d = (a.lat - lat) ** 2 + ((a.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a.countryCode;
      }
    }
    return best;
  };

  const out: University[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const code = nearestCountry(group[0].lat, group[0].lng);
    const pick = group.find((u) => u.countryCode === code) ?? group[0];
    out.push({ ...pick, countryCode: code ?? pick.countryCode, city: null });
  }
  return out;
}

async function main() {
  const requested = process.argv.slice(2).filter((a) => /^[A-Z]{2}$/.test(a));
  const codes = requested.length ? requested : EUROPEAN_COUNTRY_CODES;

  // A partial run must not discard countries fetched earlier.
  const existing: University[] = await readFile(OUT, "utf8")
    .then((t) => JSON.parse(t) as University[])
    .catch(() => []);

  process.stdout.write("Resolving institution classes ... ");
  const classes = await resolveClasses();
  console.log(`${classes.length}`);

  console.log(`Fetching ${codes.length} countries from Wikidata...\n`);
  // Write after each country so a hang/crash does not discard finished work.
  // Until a code is refreshed, its previous rows stay in the file.
  const refreshed = new Map<string, University[]>();
  const failed: string[] = [];

  const snapshot = (): University[] => {
    const next: University[] = [];
    for (const u of existing) {
      // Keep prior rows until that country is successfully refreshed.
      if (!refreshed.has(u.countryCode)) next.push({ ...u });
    }
    for (const rows of refreshed.values()) {
      for (const u of rows) next.push({ ...u });
    }
    // Before slugs, because collapsing duplicates removes names that would
    // otherwise collide and get a pointless "-2" suffix.
    const unique = dedupeByInstitution(next);
    // Slugs are the public URL key, so they have to be unique.
    const seen = new Map<string, number>();
    for (const u of unique) {
      const n = seen.get(u.slug) ?? 0;
      seen.set(u.slug, n + 1);
      if (n > 0) u.slug = `${u.slug}-${n + 1}`;
    }
    unique.sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.name.localeCompare(b.name));
    return unique;
  };

  await mkdir(path.dirname(OUT), { recursive: true });

  for (const iso of codes) {
    process.stdout.write(`  ${iso} ... `);
    const started = Date.now();
    try {
      const rows = await fetchCountry(iso, classes);
      refreshed.set(iso, rows);
      const all = snapshot();
      await writeFile(OUT, JSON.stringify(all, null, 2), "utf8");
      console.log(`${rows.length} (${((Date.now() - started) / 1000).toFixed(0)}s) → ${all.length} total`);
    } catch (err) {
      console.log(`FAILED (${(err as Error).message})`);
      failed.push(iso);
    }
    await new Promise((r) => setTimeout(r, 1000)); // be polite to a free endpoint
  }

  const all = snapshot();
  await writeFile(OUT, JSON.stringify(all, null, 2), "utf8");

  const exact = all.filter((u) => u.coordPrecision === "exact").length;
  console.log(`\nWrote ${all.length} institutions (${exact} with exact coordinates)`);

  // Emitted rows minus surviving rows: how many per-country duplicates the
  // dedupe pass absorbed. Worth surfacing because a sudden jump would mean
  // Wikidata started attaching many more countries to institutions.
  const emitted =
    existing.filter((u) => !refreshed.has(u.countryCode)).length +
    [...refreshed.values()].reduce((n, rows) => n + rows.length, 0);
  if (emitted > all.length) {
    console.log(`${emitted - all.length} multi-country duplicates collapsed to one pin each`);
  }

  if (failed.length) console.log(`Failed: re-run with  npm run data:fetch -- ${failed.join(" ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
