const { hasValidSession, sendJson, withErrors } = require("../../lib/vercel-api");

module.exports = withErrors(async (req, res) => {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  const authenticated = hasValidSession(req);
  sendJson(res, authenticated ? 200 : 401, { authenticated });
});
