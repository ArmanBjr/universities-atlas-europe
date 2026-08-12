/**
 * Resolves an English class label to its QID, restricted to the Q38723 tree.
 * Written after three of nine hand-guessed QIDs in verify-exclusions.ts turned
 * out to be a school building, a conservatory and a person.
 *
 *   npx tsx scripts/find-class.ts "university of applied sciences" conservatory
 */
import { sparql } from "./wikidata-core.ts";

async function main() {
  const terms = process.argv.slice(2);
  if (!terms.length) throw new Error('Pass at least one label, e.g. "art school"');

  for (const term of terms) {
    const query = `
SELECT ?x ?xLabel (COUNT(DISTINCT ?item) AS ?n) WHERE {
  ?x wdt:P279* wd:Q38723 .
  ?x rdfs:label ?l .
  FILTER(LANG(?l) = "en" && CONTAINS(LCASE(?l), "${term.toLowerCase().replace(/"/g, "")}"))
  OPTIONAL { ?item wdt:P31 ?x }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?x ?xLabel
ORDER BY DESC(?n)
LIMIT 8`;

    const rows = await sparql(query, `find/${term}`);
    console.log(`\n"${term}"`);
    if (!rows.length) console.log("  (nothing under Q38723)");
    for (const r of rows) {
      const qid = r.x?.value.split("/").pop() ?? "?";
      console.log(`  ${String(r.n?.value).padStart(6)}  ${qid.padEnd(10)} ${r.xLabel?.value ?? ""}`);
    }
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
