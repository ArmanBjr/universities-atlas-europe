import { Shell } from "@/components/Shell";

/**
 * Everything interactive is client-side (the map owns a WebGL canvas and all
 * state), so this page exists only to mount the shell.
 */
export default function Page() {
  return <Shell />;
}
