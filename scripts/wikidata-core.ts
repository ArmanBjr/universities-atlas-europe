/**
 * Shared Wikidata plumbing: the endpoint client, the pinned country QIDs, and
 * the institution class tree. Kept separate so diagnostic scripts query exactly
 * the same class set the importer uses — a diagnostic that disagrees with the
 * importer is worse than none.
 */
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "euro-uni-map/0.1 (personal study-abroad research project)";

/**
 * Verified against Wikidata rather than assumed. Where a "Kingdom of X" entity
 * also exists, both are listed because institutions are inconsistent about which
 * one they point at.
 */
export const COUNTRY_QIDS: Record<string, string[]> = {
  DE: ["Q183"], AT: ["Q40"], CH: ["Q39"],
  NL: ["Q55", "Q29999"], // Netherlands + Kingdom of the Netherlands
  BE: ["Q31"], FR: ["Q142"], IT: ["Q38"], ES: ["Q29"], PT: ["Q45"],
  SE: ["Q34"], NO: ["Q20"], DK: ["Q35", "Q756617"], FI: ["Q33"], IS: ["Q189"],
  IE: ["Q27"],
  GB: ["Q145", "Q21", "Q22", "Q25", "Q26"], // UK + England/Scotland/Wales/NI
  PL: ["Q36"], CZ: ["Q213"], SK: ["Q214"], HU: ["Q28"], RO: ["Q218"],
  BG: ["Q219"], GR: ["Q41"], HR: ["Q224"], SI: ["Q215"], EE: ["Q191"],
  LV: ["Q211"], LT: ["Q37"], LU: ["Q32"], MT: ["Q233"], CY: ["Q229"],
  RS: ["Q403"], UA: ["Q212"], AL: ["Q222"], BA: ["Q225"], MK: ["Q221"],
  ME: ["Q236"], MD: ["Q217"], TR: ["Q43"],
};

/** Second label language per country, so locally-named schools aren't dropped. */
export const LOCAL_LANG: Record<string, string> = {
  DE: "de", AT: "de", CH: "de", NL: "nl", BE: "nl", FR: "fr", IT: "it", ES: "es",
  PT: "pt", SE: "sv", NO: "no", DK: "da", FI: "fi", IS: "is", IE: "en", GB: "en",
  PL: "pl", CZ: "cs", SK: "sk", HU: "hu", RO: "ro", BG: "bg", GR: "el", HR: "hr",
  SI: "sl", EE: "et", LV: "lv", LT: "lt", LU: "fr", MT: "mt", CY: "el", RS: "sr",
  UA: "uk", AL: "sq", BA: "bs", MK: "mk", ME: "sr", MD: "ro", TR: "tr",
};

export const countryValues = (iso: string) =>
  `VALUES ?country { ${(COUNTRY_QIDS[iso] ?? []).map((q) => `wd:${q}`).join(" ")} }`;

/**
 * Subtrees of Q38723 that are not places you can go and study for a degree.
 *
 * The secondary-school exclusions were not obvious: Italy's first import came
 * back with 3419 "institutions", the overwhelming majority of which were licei
 * and istituti tecnici — Italian editors type them with classes that sit under
 * the higher-education tree. Excluding by subtree is far more reliable than
 * trying to pattern-match "I.T.C. L. Da Vinci - Serale" by name.
 *
 * Two exclusions that look obvious are deliberately absent:
 *   Q2385804 "educational institution" is an *ancestor* of Q38723, so excluding
 *     it empties the entire import instead of trimming it.
 *   Q3914 "school" cuts 300 classes, among them conservatory (668 items) and
 *     grande école (151) — real higher education this app exists to show.
 *
 * `scripts/verify-exclusions.ts` guards both failure modes; run it after any
 * edit to this list.
 */
export const EXCLUDED_SUBTREES: Array<[string, string]> = [
  ["Q180958", "faculty"],
  ["Q277845", "police academy"],
  ["Q917182", "military academy"],
  ["Q159334", "secondary school"],
  ["Q9826", "high school"],
];

const CLASSES_QUERY = `
SELECT ?type WHERE {
  ?type wdt:P279* wd:Q38723 .
${EXCLUDED_SUBTREES.map(([qid]) => `  FILTER NOT EXISTS { ?type wdt:P279* wd:${qid} }`).join("\n")}
}`;

export type Binding = Record<string, { value: string } | undefined>;

export async function sparql(query: string, label: string, attempt = 1): Promise<Binding[]> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { results: { bindings: Binding[] } };
    return json.results.bindings;
  } catch (err) {
    if (attempt >= 4) throw err;
    const wait = attempt * 10_000;
    process.stdout.write(`(retry ${attempt} ${label}) `);
    await new Promise((r) => setTimeout(r, wait));
    return sparql(query, label, attempt + 1);
  }
}

/**
 * The transitive subclass walk is the single most expensive part of an import,
 * so it runs once per process and every country reuses the result.
 */
export async function resolveClasses(): Promise<string[]> {
  const rows = await sparql(CLASSES_QUERY, "classes");
  return rows.map((r) => r.type!.value.split("/").pop()!).filter((q) => /^Q\d+$/.test(q));
}
