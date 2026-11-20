// POST /api/checkout  ->  { url } of a Stripe Checkout page
const { validateOrder, buildSessionParams } = require("../lib/order");

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function createHandler(getStripe) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, { error: "Guna POST." });
    }
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return send(res, 400, { error: "Data borang tidak sah." });
    }
    const v = validateOrder(body);
    if (!v.ok) return send(res, 400, { error: "Sila semak borang.", fields: v.errors });

    let stripe;
    try {
      stripe = getStripe();
    } catch (e) {
      console.error("Stripe not configured:", e.message);
      return send(res, 500, { error: "Bayaran belum disediakan. Sila cuba lagi kemudian." });
    }
    try {
      const session = await stripe.checkout.sessions.create(buildSessionParams(v.order, siteUrl(req)));
      return send(res, 200, { url: session.url });
    } catch (e) {
      console.error("Stripe error:", e && e.message);
      return send(res, 502, { error: "Tak dapat buka halaman bayaran. Sila cuba lagi." });
    }
  };
}

module.exports = createHandler(() => {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
});
module.exports.createHandler = createHandler;
