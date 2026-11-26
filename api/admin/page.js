const fs = require("node:fs");
const path = require("node:path");
const { hasValidSession } = require("../../lib/vercel-api");

module.exports = (req, res) => {
  try {
    if (!hasValidSession(req)) {
      res.writeHead(302, { Location: "/login.html", "Cache-Control": "no-store" });
      return res.end();
    }
    const html = fs.readFileSync(path.join(process.cwd(), "admin.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob: https://*.blob.vercel-storage.com; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    });
    res.end(html);
  } catch (error) {
    console.error("Could not serve the Vercel admin page:", error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("The admin page could not be loaded.");
  }
};
