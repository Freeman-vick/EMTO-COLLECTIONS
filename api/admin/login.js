const crypto = require("node:crypto");
const { isValidAdminPassword } = require("../../lib/password-policy");
const {
  createSessionCookie,
  readJson,
  registerLoginAttempt,
  resetLoginAttempts,
  sameOrigin,
  sendJson,
  withErrors,
} = require("../../lib/vercel-api");

module.exports = withErrors(async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
  if (await registerLoginAttempt(req) > 8) {
    return sendJson(res, 429, { error: "Too many sign-in attempts. Wait 15 minutes and try again." });
  }

  const body = await readJson(req);
  const password = process.env.EMTO_ADMIN_PASSWORD;
  if (!isValidAdminPassword(password)) throw new Error("EMTO_ADMIN_PASSWORD is missing or shorter than 8 characters.");
  const supplied = Buffer.from(String(body?.password || ""));
  const expected = Buffer.from(password);
  const valid = supplied.length === expected.length
    && crypto.timingSafeEqual(supplied, expected);
  if (!valid) return sendJson(res, 401, { error: "That password didn’t match. Try again." });

  await resetLoginAttempts(req);
  sendJson(res, 200, { ok: true }, { "Set-Cookie": createSessionCookie(req) });
});
