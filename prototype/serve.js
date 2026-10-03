const protoRoot = new URL("./", import.meta.url);
const repoRoot = new URL("../", protoRoot);
const sharedPrefixes = ["characters/", "ui-gameplay2/", "sound/", "bgm/"];

const server = Bun.serve({
  port: 4173,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (pathname.endsWith("/")) pathname += "index.html";
    const rel = pathname.replace(/^\/+/, "");
    if (!rel || rel.split("/").includes("..")) {
      return new Response("not found", { status: 404 });
    }

    const local = new URL(rel, protoRoot);
    if (local.pathname.startsWith(protoRoot.pathname)) {
      const file = Bun.file(local);
      if (await file.exists()) {
        return new Response(file, { headers: { "cache-control": "no-store" } });
      }
    }

    // prototype/index.html references ../characters, ../ui-gameplay2, ../sound, ../bgm.
    // From the site root those URLs arrive as /characters/… and so on.
    if (!sharedPrefixes.some((prefix) => rel.startsWith(prefix))) {
      return new Response("not found", { status: 404 });
    }
    const shared = new URL(rel, repoRoot);
    if (!shared.pathname.startsWith(repoRoot.pathname)) {
      return new Response("not found", { status: 404 });
    }
    const sharedFile = Bun.file(shared);
    if (!(await sharedFile.exists())) return new Response("not found", { status: 404 });
    return new Response(sharedFile, { headers: { "cache-control": "no-store" } });
  },
});
console.log(`星空情緣原型 http://${server.hostname}:${server.port}`);
