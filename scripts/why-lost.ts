/**
 * Explains why a class is absent from the resolved tree: it was either never a
 * subclass of Q38723, or it was cut by a specific exclusion. Those need
 * opposite fixes, so guessing between them is not good enough.
 *
 *   npx tsx scripts/why-lost.ts Q1244442 Q31855
 */
import { EXCLUDED_SUBTREES, sparql } from "./wikidata-core.ts";

async function main() {
  const targets = process.argv.slice(2).filter((a) => /^Q\d+$/.test(a));
  if (!targets.length) throw new Error("Pass at least one QID");

  const cutFlags = EXCLUDED_SUBTREES.map(
    ([qid], i) => `  BIND(EXISTS { ?x wdt:P279* wd:${qid} } AS ?c${i})`,
  ).join("\n");

  const query = `
SELECT ?x ?xLabel ?inTree ${EXCLUDED_SUBTREES.map((_, i) => `?c${i}`).join(" ")} WHERE {
  VALUES ?x { ${targets.map((q) => `wd:${q}`).join(" ")} }
  BIND(EXISTS { ?x wdt:P279* wd:Q38723 } AS ?inTree)
${cutFlags}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

  const rows = await sparql(query, "why-lost");
  for (const r of rows) {
    const qid = r.x?.value.split("/").pop() ?? "?";
    const label = r.xLabel?.value ?? "";
    const inTree = r.inTree?.value === "true";
    const cutBy = EXCLUDED_SUBTREES.filter((_, i) => r[`c${i}`]?.value === "true").map(
      ([q, name]) => `${name} (${q})`,
    );

    if (!inTree) {
      console.log(`  ${qid.padEnd(10)} not under Q38723 at all — exclusions are irrelevant`);
    } else if (cutBy.length) {
      console.log(`  ${qid.padEnd(10)} in tree, cut by: ${cutBy.join(", ")}`);
    } else {
      console.log(`  ${qid.padEnd(10)} present and kept`);
    }
    console.log(`  ${"".padEnd(10)} ${label}\n`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
