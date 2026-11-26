const {
  getInventory,
  persistableInventory,
  readJson,
  requireSession,
  sameOrigin,
  saveInventory,
  sendJson,
  validateInventory,
  withErrors,
} = require("../../lib/vercel-api");

module.exports = withErrors(async (req, res) => {
  if (!["GET", "PUT"].includes(req.method)) {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET, PUT" });
  }
  if (!requireSession(req, res)) return;
  if (req.method === "GET") return sendJson(res, 200, await getInventory());
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "Request origin rejected." });

  const body = await readJson(req);
  const products = validateInventory(body?.products);
  if (!products) return sendJson(res, 400, { error: "Inventory data is invalid." });
  const ready = await persistableInventory(products);
  await saveInventory(ready);
  sendJson(res, 200, { ok: true, products: ready });
});
