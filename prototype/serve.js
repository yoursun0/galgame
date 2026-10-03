const root = new URL(".", import.meta.url);
const server = Bun.serve({
  port: 4173,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (pathname.endsWith("/")) pathname += "index.html";
    const fileUrl = new URL("." + pathname, root);
    if (!fileUrl.pathname.startsWith(root.pathname)) {
      return new Response("not found", { status: 404 });
    }
    const file = Bun.file(fileUrl);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file, { headers: { "cache-control": "no-store" } });
  },
});
console.log(`星空情緣原型 http://${server.hostname}:${server.port}`);
