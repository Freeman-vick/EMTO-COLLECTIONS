const crypto = require("node:crypto");

const COOKIE = "emto_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const allowedCategories = new Set(["shoes", "innerwear", "duvets"]);
const fallbackImages = new Set(["images/shoes.jpg", "images/Innerwear.jpg", "images/duvets.jpg"]);
let sqlClient;
let blobPut;

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Vercel API request failed:", error);
      if (!res.headersSent && error.status) sendJson(res, error.status, { error: error.message });
      else if (!res.headersSent) sendJson(res, 500, { error: "The shop service could not complete the request." });
      else res.end();
    }
  };
}

function requiredEnv(name, minimumLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} is missing or too short.`);
  }
  return value;
}

async function getSql() {
  if (!sqlClient) {
    const connectionString = requiredEnv("DATABASE_URL");
    const { neon } = await import("@neondatabase/serverless");
    sqlClient = neon(connectionString);
  }
  return sqlClient;
}

async function getBlobPut() {
  if (!blobPut) {
    ({ put: blobPut } = await import("@vercel/blob"));
  }
  return blobPut;
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      if (Buffer.byteLength(req.body) > MAX_BODY_BYTES) throw Object.assign(new Error("Request is too large."), { status: 413 });
      try { return JSON.parse(req.body.toString()); }
      catch { throw Object.assign(new Error("Invalid JSON request."), { status: 400 }); }
    }
    return req.body;
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw Object.assign(new Error("Request is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON request."), { status: 400 }); }
}

function parseCookies(req) {
  const cookies = {};
  for (const piece of (req.headers.cookie || "").split(";")) {
    const separator = piece.indexOf("=");
    if (separator < 0) continue;
    const name = piece.slice(0, separator).trim();
    try { cookies[name] = decodeURIComponent(piece.slice(separator + 1).trim()); }
    catch { /* Ignore malformed cookies. */ }
  }
  return cookies;
}

function sessionSecret() {
  return requiredEnv("EMTO_SESSION_SECRET", 32);
}

function sessionSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest();
}

function hasValidSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); }
  catch { return false; }
  const expected = sessionSignature(payload, sessionSecret());
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isSafeInteger(session.exp) && session.exp > Date.now();
  } catch {
    return false;
  }
}

function createSessionCookie(req) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
  const signature = sessionSignature(payload, sessionSecret()).toString("base64url");
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; }
  catch { return false; }
}

function remoteAddress(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || "unknown")
    .split(",")[0].trim();
}

async function resetLoginAttempts(req) {
  const sql = await getSql();
  const secret = sessionSecret();
  const ipHash = crypto.createHmac("sha256", secret).update(remoteAddress(req)).digest("hex");
  await sql`DELETE FROM emto_admin_login_attempts WHERE ip_hash = ${ipHash}`;
}

async function registerLoginAttempt(req) {
  const sql = await getSql();
  const secret = sessionSecret();
  const ipHash = crypto.createHmac("sha256", secret).update(remoteAddress(req)).digest("hex");
  const rows = await sql`
    INSERT INTO emto_admin_login_attempts (ip_hash, window_start, attempts)
    VALUES (${ipHash}, now(), 1)
    ON CONFLICT (ip_hash) DO UPDATE SET
      attempts = CASE
        WHEN emto_admin_login_attempts.window_start < now() - interval '15 minutes' THEN 1
        ELSE emto_admin_login_attempts.attempts + 1
      END,
      window_start = CASE
        WHEN emto_admin_login_attempts.window_start < now() - interval '15 minutes' THEN now()
        ELSE emto_admin_login_attempts.window_start
      END
    RETURNING attempts`;
  return Number(rows[0].attempts);
}

function parseImageData(image) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { buffer, contentType: `image/${match[1]}`, extension: match[1] === "jpeg" ? "jpg" : match[1] };
}

function validImage(image) {
  if (fallbackImages.has(image)) return true;
  if (parseImageData(image)) return true;
  try {
    const url = new URL(image);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
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
    if (!id || ids.has(id) || !name || name.length > 70 || !allowedCategories.has(category)
      || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0
      || description.length > 180 || !validImage(image)) return null;
    ids.add(id);
    result.push({ id, name, category, price, stock, description, image });
  }
  return result;
}

async function persistableInventory(products) {
  const put = await getBlobPut();
  const ready = [];
  for (const product of products) {
    const parsedImage = parseImageData(product.image);
    if (!parsedImage) {
      ready.push(product);
      continue;
    }
    const blob = await put(`products/${crypto.randomUUID()}.${parsedImage.extension}`, parsedImage.buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: parsedImage.contentType,
    });
    ready.push({ ...product, image: blob.url });
  }
  return ready;
}

async function uploadImageData(image) {
  const parsed = parseImageData(image);
  if (!parsed) throw Object.assign(new Error("Photo is invalid or too large. Choose a smaller image."), { status: 400 });
  const put = await getBlobPut();
  const blob = await put(`products/${crypto.randomUUID()}.${parsed.extension}`, parsed.buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: parsed.contentType,
  });
  return blob.url;
}

async function getInventory() {
  const sql = await getSql();
  const rows = await sql`SELECT products FROM emto_inventory WHERE id = 1`;
  return rows.length ? rows[0].products : [];
}

async function saveInventory(products) {
  const sql = await getSql();
  const encoded = JSON.stringify(products);
  await sql`
    INSERT INTO emto_inventory (id, products)
    VALUES (1, ${encoded}::jsonb)
    ON CONFLICT (id) DO UPDATE SET products = EXCLUDED.products, updated_at = now()`;
}

function requireSession(req, res) {
  if (hasValidSession(req)) return true;
  sendJson(res, 401, { error: "Please sign in again." });
  return false;
}

module.exports = {
  clearSessionCookie,
  createSessionCookie,
  getInventory,
  hasValidSession,
  parseImageData,
  persistableInventory,
  readJson,
  registerLoginAttempt,
  requireSession,
  resetLoginAttempts,
  sameOrigin,
  saveInventory,
  sendJson,
  uploadImageData,
  withErrors,
  validateInventory,
};
