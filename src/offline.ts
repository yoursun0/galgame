/**
 * Offline helpers: precache URL list + service worker registration.
 * Work assets ship in the Vite build; the SW caches the static shell.
 * Advertise offline only when work.json sets offlineReady: true.
 */

export function normalizeBase(base: string): string {
  if (!base || base === "/") return "/";
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  return withSlash.startsWith("/") ? withSlash : `/${withSlash}`;
}

export function withBase(base: string, rel: string): string {
  const b = normalizeBase(base);
  const clean = rel.replace(/^\//, "");
  if (b === "/") return `/${clean}`;
  return `${b}${clean}`;
}

/** Build install-time precache URLs from dist-relative paths. */
export function buildPrecacheList(files: string[], base = "/"): string[] {
  const b = normalizeBase(base);
  const urls = new Set<string>();
  urls.add(withBase(b, "index.html"));
  urls.add(withBase(b, "manifest.webmanifest"));
  for (const file of files) {
    const rel = file.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!rel || rel === "sw.js" || rel.endsWith(".map")) continue;
    urls.add(withBase(b, rel));
  }
  return [...urls].sort();
}

export function isWorkOfflineReady(manifest: { offlineReady?: boolean }): boolean {
  return manifest.offlineReady === true;
}

const SW_RELOAD_FLAG = "galgame-sw-reloaded";

function postSkipWaiting(worker: ServiceWorker | null | undefined): void {
  worker?.postMessage({ type: "SKIP_WAITING" });
}

export async function registerServiceWorker(base = "/"): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const b = normalizeBase(base);
  try {
    const reg = await navigator.serviceWorker.register(withBase(b, "sw.js"), { scope: b });
    if (reg.waiting) postSkipWaiting(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const next = reg.installing;
      if (!next) return;
      next.addEventListener("statechange", () => {
        if (next.state === "installed" && navigator.serviceWorker.controller) {
          postSkipWaiting(next);
        }
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      try {
        if (sessionStorage.getItem(SW_RELOAD_FLAG)) {
          sessionStorage.removeItem(SW_RELOAD_FLAG);
          return;
        }
        sessionStorage.setItem(SW_RELOAD_FLAG, "1");
      } catch {
        /* private mode or blocked storage */
      }
      location.reload();
    });
    return true;
  } catch {
    return false;
  }
}
