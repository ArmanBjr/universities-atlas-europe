/**
 * Guards the class-exclusion list in wikidata-core.ts.
 *
 * Two ways an exclusion can go wrong, and this checks for both:
 *
 *  1. It is an *ancestor* of Q38723 — "educational institution", for instance,
 *     sits above it, so filtering on it silently empties the entire import
 *     rather than trimming the noise.
 *  2. It is safe on its own but drags a class we need out with it. Wikidata
 *     classes have many parents, and "school" alone cuts 300 classes from the
 *     tree, so the survival of the classes that carry real universities has to
 *     be asserted rather than assumed.
 *
 *   npx tsx scripts/verify-exclusions.ts Q159334 Q9826
 */
import { EXCLUDED_SUBTREES, resolveClasses, sparql } from "./wikidata-core.ts";

/**
 * Classes that must survive the exclusions. These are the ones that actually
 * carry the institutions this app exists to show, so losing any of them is a
 * failure however clean the rest of the tree looks.
 */
const MUST_SURVIVE: Array<[string, string]> = [
  ["Q3918", "university"],
  ["Q875538", "public university"],
  ["Q902104", "private university"],
  ["Q189004", "college"],
  ["Q1371037", "technical university"],
  ["Q1365560", "university of applied sciences"],
  ["Q184644", "conservatory"],
  ["Q847027", "grande école"],
  ["Q16707841", "higher conservatory of music"],
];

async function main() {
  // Default to the live list rather than a copy of it — a guard that checks a
  // stale duplicate would pass while the importer runs something else.
  const qids = process.argv.slice(2).filter((a) => /^Q\d+$/.test(a));
  const targets = qids.length ? qids : EXCLUDED_SUBTREES.map(([q]) => q);

  // `cut` is the number of Q38723 descendants the exclusion would actually
  // remove. It matters more than the ancestor/descendant relation on its own:
  // Wikidata classes have several parents, so a class can sit under Q38723 and
  // under "high school" at the same time, which makes a nominally unrelated
  // exclusion still bite.
  const query = `
SELECT ?x ?xLabel ?isAncestor (COUNT(DISTINCT ?type) AS ?cut) WHERE {
  VALUES ?x { ${targets.map((q) => `wd:${q}`).join(" ")} }
  BIND(EXISTS { wd:Q38723 wdt:P279* ?x } AS ?isAncestor)
  OPTIONAL {
    ?type wdt:P279* wd:Q38723 .
    ?type wdt:P279* ?x .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?x ?xLabel ?isAncestor
ORDER BY DESC(?cut)`;

  const rows = await sparql(query, "verify");
  let unsafe = 0;

  for (const r of rows) {
    const qid = r.x?.value.split("/").pop() ?? "?";
    const ancestor = r.isAncestor?.value === "true";
    const cut = Number(r.cut?.value ?? 0);
    // An ancestor would take the whole tree with it; a class that removes
    // nothing is dead weight in the list and should be dropped.
    const verdict = ancestor
      ? "UNSAFE — ancestor of Q38723"
      : cut === 0
        ? "no-op — cuts nothing"
        : `ok — cuts ${cut} class(es)`;
    if (ancestor) unsafe++;
    console.log(`  ${qid.padEnd(10)} ${verdict.padEnd(30)} ${r.xLabel?.value ?? ""}`);
  }

  if (unsafe) {
    console.error(`\n${unsafe} exclusion(s) would empty the import. Remove them.`);
    process.exit(1);
  }

  // Only meaningful against the live list — a hand-picked argv set would be
  // checked against exclusions it does not represent.
  if (qids.length) {
    console.log("\nExclusions safe. (Survival check skipped for an explicit QID list.)");
    return;
  }

  process.stdout.write("\nResolving surviving class tree... ");
  const surviving = new Set(await resolveClasses());
  console.log(`${surviving.size}\n`);

  const lost = MUST_SURVIVE.filter(([qid]) => !surviving.has(qid));
  for (const [qid, label] of MUST_SURVIVE) {
    console.log(`  ${qid.padEnd(10)} ${surviving.has(qid) ? "kept" : "LOST"}   ${label}`);
  }

  if (lost.length) {
    console.error(
      `\n${lost.length} required class(es) were excluded as collateral. ` +
        `Narrow the exclusion that removes them.`,
    );
    process.exit(1);
  }
  console.log("\nAll exclusions safe, all required classes kept.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
