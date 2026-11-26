const { getInventory, sendJson, withErrors } = require("../lib/vercel-api");

module.exports = withErrors(async (req, res) => {
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  sendJson(res, 200, await getInventory());
});
