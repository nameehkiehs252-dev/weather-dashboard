/**
 * Minimal static file server so the app works with VS Code/Cursor launch.json (port 8080).
 * Run: node server.js — or use the "Node: weather_dashboard_ai" debug configuration.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const ROOT = path.resolve(__dirname);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function safeJoin(root, urlPath) {
  const rel = path.normalize(urlPath.replace(/^\//, "")).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.join(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  let pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname === "/" || pathname === "") pathname = "/index.html";

  const filePath = safeJoin(ROOT, pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`listening on http://localhost:${PORT}`);
});
