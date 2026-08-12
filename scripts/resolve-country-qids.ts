/**
 * One-off helper: maps each configured ISO code to its Wikidata QID(s).
 *
 * Looking countries up by P297 at query time is a trap — "NL" resolves to
 * Kingdom of the Netherlands (Q29999) while universities use Netherlands (Q55).
 * We resolve once, eyeball the result, and pin the QIDs in the importer.
 */
import { EUROPEAN_COUNTRY_CODES } from "../src/lib/countries.ts";

const query = `
SELECT ?code ?x ?xLabel WHERE {
  VALUES ?code { ${EUROPEAN_COUNTRY_CODES.map((c) => `"${c}"`).join(" ")} }
  ?x wdt:P297 ?code .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

const res = await fetch("https://query.wikidata.org/sparql", {
  method: "POST",
  headers: {
    "User-Agent": "euro-uni-map/0.1",
    Accept: "application/sparql-results+json",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({ query }),
});

const json = (await res.json()) as {
  results: { bindings: Record<string, { value: string }>[] };
};

const byCode = new Map<string, string[]>();
for (const b of json.results.bindings) {
  const code = b.code.value;
  const entry = `${b.x.value.split("/").pop()} (${b.xLabel.value})`;
  const list = byCode.get(code) ?? [];
  if (!list.includes(entry)) list.push(entry);
  byCode.set(code, list);
}

for (const code of EUROPEAN_COUNTRY_CODES) {
  console.log(code.padEnd(4), (byCode.get(code) ?? ["** NONE **"]).join("  |  "));
}
