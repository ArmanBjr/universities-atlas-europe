/**
 * Which Wikidata classes are actually producing the rows for a country?
 *
 * The Q38723 subtree is large and includes surprises — Italy's import came back
 * with thousands of secondary schools, and the only way to find the offending
 * subclass is to count matches per class rather than guess from names.
 *
 *   npx tsx scripts/diagnose-classes.ts IT
 */
import { COUNTRY_QIDS, resolveClasses, sparql } from "./wikidata-core.ts";

async function main() {
  const iso = (process.argv[2] ?? "IT").toUpperCase();
  const qids = COUNTRY_QIDS[iso];
  if (!qids) throw new Error(`No QIDs for ${iso}`);

  process.stdout.write("Resolving class tree... ");
  const classes = await resolveClasses();
  console.log(`${classes.length}\n`);

  // The whole class list in one VALUES block 504s on a country the size of
  // Italy, so the census is chunked. Counts are per class and independent, so
  // splitting changes nothing but the runtime.
  const CHUNK = 80;
  const counts: Array<{ qid: string; label: string; n: number }> = [];
  const chunks = Math.ceil(classes.length / CHUNK);

  for (let i = 0; i < classes.length; i += CHUNK) {
    const slice = classes.slice(i, i + CHUNK);
    process.stdout.write(`  chunk ${i / CHUNK + 1}/${chunks} `);

    const query = `
SELECT ?type ?typeLabel (COUNT(DISTINCT ?item) AS ?n) WHERE {
  VALUES ?country { ${qids.map((q) => `wd:${q}`).join(" ")} }
  VALUES ?type { ${slice.map((c) => `wd:${c}`).join(" ")} }
  ?item wdt:P31 ?type ; wdt:P17 ?country .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?type ?typeLabel
ORDER BY DESC(?n)`;

    const rows = await sparql(query, `${iso}/classes`);
    for (const r of rows) {
      const n = Number(r.n?.value ?? 0);
      if (!n) continue;
      counts.push({
        qid: r.type?.value.split("/").pop() ?? "?",
        label: r.typeLabel?.value ?? "",
        n,
      });
    }
    console.log(`(${rows.length})`);
  }

  counts.sort((a, b) => b.n - a.n);
  const total = counts.reduce((sum, c) => sum + c.n, 0);
  console.log(`\n${iso}: ${counts.length} classes matched, ${total} item-rows\n`);
  for (const c of counts.slice(0, 40)) {
    console.log(`  ${String(c.n).padStart(6)}  ${c.qid.padEnd(10)} ${c.label}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
