/**
 * Copies MapLibre's worker bundle into `public/` so it can be served same-origin.
 *
 * MapLibre 6 works out where its worker lives by reading `import.meta.url`:
 *
 *   function () {
 *     let e = import.meta.url;
 *     if (!/^https?:/.test(e)) return ``;          // <- Turbopack lands here
 *     return new URL(`./maplibre-gl-worker.mjs`, e).href;
 *   }
 *
 * Under Turbopack `import.meta.url` is not an http(s) URL, so that returns an
 * empty string and MapLibre calls `new Worker("", { type: "module" })`. An empty
 * URL resolves to the *document*, so the worker tries to parse the HTML page as
 * an ES module, dies on the first `<`, and never answers a single message. There
 * is no error event and no console output — the map just renders its raster
 * basemap and silently drops every GeoJSON layer, because those are parsed in
 * the worker. Diagnosing that from the symptom costs hours, so it is worth the
 * two files.
 *
 * The fix is to hand MapLibre a real URL via `setWorkerUrl` (see MapCanvas.tsx),
 * which means the worker bundle has to be reachable over HTTP. `maplibre-gl-worker.mjs`
 * statically imports `./maplibre-gl-shared.mjs`, so both go to the same folder.
 *
 * Runs from `predev`/`prebuild`, and re-copies whenever the source is newer, so
 * a `maplibre-gl` upgrade cannot leave a stale worker behind.
 */
import { createRequire } from "node:module";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const DEST_DIR = join(process.cwd(), "public", "maplibre");

const require = createRequire(import.meta.url);
const distDir = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));

async function mtime(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

await mkdir(DEST_DIR, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const from = join(distDir, file);
  const to = join(DEST_DIR, file);
  const [src, dst] = await Promise.all([mtime(from), mtime(to)]);
  if (src === null) throw new Error(`maplibre-gl is missing ${file} — did the package layout change?`);
  if (dst !== null && dst >= src) continue;
  await copyFile(from, to);
  copied++;
}

if (copied > 0) console.log(`maplibre worker: copied ${copied} file(s) to public/maplibre`);
