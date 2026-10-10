import { readFileSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { inspectAssetFile } from "./src/links.ts";
import { normalizeBase } from "./src/offline.ts";
import { galgamePwa } from "./src/pwa-plugin.ts";

const mediaTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/** Serve the file a work asset points at. See src/links.ts. */
function followStoredLinks(root: string): Plugin {
  return {
    name: "follow-stored-links",
    enforce: "pre",
    load(id) {
      if (!id.includes("?") || !/(?:[?&])url(?:&|$)/.test(id)) return null;
      const file = fsPath(id.slice(0, id.indexOf("?")));
      const inspected = inspectAssetFile(file, root);
      if (inspected.kind !== "link") return null;
      if (this.meta.watchMode) {
        return `export default ${JSON.stringify(publicUrl(root, inspected.target))}`;
      }
      const referenceId = this.emitFile({
        type: "asset",
        name: basename(inspected.target),
        originalFileName: relative(root, inspected.target).split(sep).join("/"),
        source: readFileSync(inspected.target),
      });
      return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathname, query = ""] = (req.url ?? "").split("?");
        if (!pathname || !pathname.startsWith("/") || /(^|&)(import|url|raw)(&|$)/.test(query)) {
          return next();
        }
        let rel: string;
        try {
          rel = decodeURIComponent(pathname);
        } catch {
          return next();
        }
        if (rel.includes("\0")) return next();
        const inspected = inspectAssetFile(resolve(root, rel.slice(1)), root);
        if (inspected.kind !== "link") return next();
        const body = readFileSync(inspected.target);
        const type = mediaTypes[extname(inspected.target).toLowerCase()] ?? "application/octet-stream";
        res.statusCode = 200;
        res.setHeader("Content-Type", type);
        res.setHeader("Content-Length", String(body.length));
        res.setHeader("Cache-Control", "no-cache");
        res.end(body);
      });
    },
  };
}

function publicUrl(root: string, target: string): string {
  const rel = relative(root, target).split(sep).join("/");
  return `/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

function fsPath(id: string): string {
  let file = id;
  if (file.startsWith("/@fs/")) file = file.slice("/@fs/".length);
  if (/^\/[A-Za-z]:\//.test(file)) file = file.slice(1);
  return file;
}

const base = normalizeBase(process.env.BASE_PATH ?? "/");

export default defineConfig({
  root: ".",
  base,
  plugins: [followStoredLinks(process.cwd()), galgamePwa({ base })],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
