const {
  readJson,
  requireSession,
  sameOrigin,
  sendJson,
  uploadImageData,
  withErrors,
} = require("../../lib/vercel-api");

module.exports = withErrors(async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  if (!requireSession(req, res)) return;
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });
  const body = await readJson(req);
  if (typeof body?.image !== "string") return sendJson(res, 400, { error: "Photo is invalid." });
  sendJson(res, 200, { image: await uploadImageData(body.image) });
});
