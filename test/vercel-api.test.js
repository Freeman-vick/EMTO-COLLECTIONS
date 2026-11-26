const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSessionCookie,
  hasValidSession,
  parseImageData,
  sameOrigin,
  validateInventory,
} = require("../lib/vercel-api");
const sessionRoute = require("../api/admin/session");
const adminProductsRoute = require("../api/admin/products");
const adminPageRoute = require("../api/admin/page");

process.env.EMTO_SESSION_SECRET = "unit-test-session-secret-with-more-than-32-characters";

const product = {
  id: "shoe-1",
  name: "Canvas shoes",
  category: "shoes",
  price: 2500,
  stock: 3,
  description: "",
  image: "images/shoes.jpg",
};

function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

test("accepts valid inventory and rejects duplicate product IDs", () => {
  assert.deepEqual(validateInventory([product]), [product]);
  assert.equal(validateInventory([product, product]), null);
});

test("accepts only supported image data URLs under the image size limit", () => {
  assert.equal(parseImageData("data:image/jpeg;base64,aGVsbG8=").contentType, "image/jpeg");
  assert.equal(parseImageData("data:image/svg+xml;base64,PHN2Zz4="), null);
  const tooLarge = `data:image/jpeg;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")}`;
  assert.equal(parseImageData(tooLarge), null);
});

test("validates signed admin cookies and rejects tampering", () => {
  const cookie = createSessionCookie({ headers: {} }).split(";")[0];
  const request = { headers: { cookie } };
  assert.equal(hasValidSession(request), true);
  const [name, value] = cookie.split("=");
  const [payload, signature] = value.split(".");
  request.headers.cookie = `${name}=${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  assert.equal(hasValidSession(request), false);
});

test("requires matching origin and host for state-changing requests", () => {
  assert.equal(sameOrigin({ headers: { origin: "https://shop.example", host: "shop.example" } }), true);
  assert.equal(sameOrigin({ headers: { origin: "https://other.example", host: "shop.example" } }), false);
  assert.equal(sameOrigin({ headers: { host: "shop.example" } }), false);
});

test("requires authentication for admin APIs and the Vercel admin page", async () => {
  const req = { method: "GET", headers: {} };
  const sessionResponse = response();
  await sessionRoute(req, sessionResponse);
  assert.equal(sessionResponse.status, 401);

  const productsResponse = response();
  await adminProductsRoute(req, productsResponse);
  assert.equal(productsResponse.status, 401);

  const pageResponse = response();
  adminPageRoute(req, pageResponse);
  assert.equal(pageResponse.status, 302);
  assert.equal(pageResponse.headers.Location, "/login.html");
});
