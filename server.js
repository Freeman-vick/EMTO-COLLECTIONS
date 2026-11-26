const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
const COOKIE = "emto_admin_session";
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_BODY = 12 * 1024 * 1024;
const allowedCategories = new Set(["shoes", "innerwear", "duvets"]);
const fallbackImages = new Set(["images/shoes.jpg", "images/Innerwear.jpg", "images/duvets.jpg"]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

function readLocalConfig() {
  const configPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(configPath)) return;
  for (const line of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
readLocalConfig();
const password = process.env.EMTO_ADMIN_PASSWORD
  || (process.env.EMTO_ADMIN_PASSWORD_B64 ? Buffer.from(process.env.EMTO_ADMIN_PASSWORD_B64, "base64").toString("utf8") : "");
if (password.length < 16) {
  console.error("Admin password missing or too short. Run setup-admin.ps1, then restart the server.");
  process.exit(1);
}
const passwordSalt = crypto.randomBytes(16);
const passwordHash = crypto.scryptSync(password, passwordSalt, 64);
const sessions = new Map();
const attempts = new Map();
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(INVENTORY_FILE)) fs.writeFileSync(INVENTORY_FILE, "[]\n", "utf8");

function readInventory() {
  try {
    const value = JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
let inventory = readInventory();
function writeInventory(next) {
  const tempPath = `${INVENTORY_FILE}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, INVENTORY_FILE);
  inventory = next;
}
function sendJson(res, status, value, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(JSON.stringify(value));
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((piece) => {
    const index = piece.indexOf("=");
    return index < 0 ? ["", ""] : [piece.slice(0, index).trim(), decodeURIComponent(piece.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function currentSession(req) {
  const token = parseCookies(req)[COOKIE];
  const expiry = token && sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return token;
}
function authorized(req, res) {
  if (currentSession(req)) return true;
  sendJson(res, 401, { error: "Please sign in again." });
  return false;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; }
  catch { return false; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        reject(Object.assign(new Error("Request is too large."), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(Object.assign(new Error("Invalid JSON request."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function validateInventory(value) {
  if (!Array.isArray(value) || value.length > 500) return null;
  const ids = new Set();
  const result = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || "").slice(0, 80);
    const name = String(raw.name || "").trim();
    const category = String(raw.category || "");
    const price = Number(raw.price);
    const stock = Number(raw.stock);
    const description = String(raw.description || "").trim();
    const image = String(raw.image || "");
    const validImage = fallbackImages.has(image) || /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(image);
    if (!id || ids.has(id) || !name || name.length > 70 || !allowedCategories.has(category)
      || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0
      || description.length > 180 || !validImage || image.length > 4_000_000) return null;
    ids.add(id);
    result.push({ id, name, category, price, stock, description, image });
  }
  return result;
}
async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/products") {
    return sendJson(res, 200, inventory);
  }
  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
    const ip = req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = attempts.get(ip) || { count: 0, since: now };
    if (now - entry.since > 15 * 60 * 1000) { entry.count = 0; entry.since = now; }
    if (entry.count >= 8) return sendJson(res, 429, { error: "Too many sign-in attempts. Wait 15 minutes and try again." });
    let body;
    try { body = await readBody(req); }
    catch (error) { return sendJson(res, error.status || 400, { error: error.message }); }
    const supplied = Buffer.from(String(body.password || ""));
    const candidate = crypto.scryptSync(supplied, passwordSalt, 64);
    const valid = supplied.length === Buffer.byteLength(password) && crypto.timingSafeEqual(candidate, passwordHash);
    if (!valid) {
      entry.count += 1;
      attempts.set(ip, entry);
      return sendJson(res, 401, { error: "That password didn’t match. Try again." });
    }
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, now + SESSION_TTL);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`,
    });
  }
  if (req.method === "GET" && url.pathname === "/api/admin/session") {
    return currentSession(req)
      ? sendJson(res, 200, { authenticated: true })
      : sendJson(res, 401, { authenticated: false });
  }
  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
    const token = currentSession(req);
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }
  if (req.method === "POST" && url.pathname === "/api/admin/image") {
    if (!authorized(req, res)) return;
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
    let body;
    try { body = await readBody(req); }
    catch (error) { return sendJson(res, error.status || 400, { error: error.message }); }
    const image = String(body?.image || "");
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match || Buffer.from(match[1], "base64").length > 2 * 1024 * 1024) {
      return sendJson(res, 400, { error: "Photo is invalid or too large. Choose a smaller image." });
    }
    return sendJson(res, 200, { image });
  }
  if (url.pathname === "/api/admin/products") {
    if (!authorized(req, res)) return;
    if (req.method === "GET") return sendJson(res, 200, inventory);
    if (req.method === "PUT") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
      let body;
      try { body = await readBody(req); }
      catch (error) { return sendJson(res, error.status || 400, { error: error.message }); }
      const next = validateInventory(body.products);
      if (!next) return sendJson(res, 400, { error: "Inventory data is invalid or too large." });
      try { writeInventory(next); }
      catch { return sendJson(res, 500, { error: "Could not save inventory to disk." }); }
      return sendJson(res, 200, { ok: true, products: inventory });
    }
  }
  return sendJson(res, 404, { error: "Not found." });
}

function safeFilePath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relative);
  return filePath.startsWith(`${ROOT}${path.sep}`) ? filePath : null;
}
function serveStatic(req, res, url) {
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); }
  catch { return sendJson(res, 404, { error: "Not found." }); }
  const lowerPath = decodedPath.toLowerCase();
  const privateFiles = new Set(["server.js", "setup-admin.ps1", "readme.md", ".gitignore"]);
  if (decodedPath.split(/[\\/]/).some((part) => part.startsWith("."))
    || lowerPath.startsWith("/data/")
    || privateFiles.has(path.basename(decodedPath).toLowerCase())) {
    return sendJson(res, 404, { error: "Not found." });
  }
  const filePath = safeFilePath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("Not found");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  const requestedFile = safeFilePath(url.pathname);
  if (requestedFile && requestedFile.toLowerCase() === path.join(ROOT, "admin.html").toLowerCase() && !currentSession(req)) {
    res.writeHead(302, { Location: "/login.html?next=admin", "Cache-Control": "no-store" });
    return res.end();
  }
  return serveStatic(req, res, url);
});
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`EMTO COLLECTIONS is running at http://${host}:${port}`);
  console.log("Admin sign-in: /login.html");
  console.log("Stop the server with Ctrl+C.");
});
