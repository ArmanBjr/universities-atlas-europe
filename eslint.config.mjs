import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 ships native flat config, so it is spread directly.
 * Routing it through `FlatCompat` instead throws "Converting circular structure
 * to JSON" — the compat layer tries to serialise an already-flat config whose
 * plugin objects reference each other.
 */
const config = [
  { ignores: [".next/**", "node_modules/**", "data/**", "drizzle/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // This project leans on refs to keep expensive objects (the MapLibre
      // instance, in-flight requests) out of effect dependencies. That is a
      // deliberate pattern, but it is exactly the pattern that hides stale
      // closures, so the rule stays on as an error rather than a warning.
      "react-hooks/exhaustive-deps": "error",
    },
  },
];

export default config;
