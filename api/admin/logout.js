const { clearSessionCookie, sameOrigin, sendJson, withErrors } = require("../../lib/vercel-api");

module.exports = withErrors(async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
  sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
});
