const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, validateOrder, buildSessionParams } = require("../lib/order");
const { createHandler } = require("../api/checkout");
const tap = require("../api/tap");

const card = { name: "Ahmad", whatsapp: "012-345 6789", greeting: "" };
const good = { pack: "1", cards: [card], delivery: "pos-sm", agree: true };

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b || ""; },
    json() { return JSON.parse(this.body); },
  };
}

test("normalizePhone accepts common Malaysian formats", () => {
  assert.equal(normalizePhone("012-345 6789"), "60123456789");
  assert.equal(normalizePhone("+60 11-2345 6789"), "601123456789");
  assert.equal(normalizePhone("6019 876 5432"), "60198765432");
  assert.equal(normalizePhone("123456789"), "60123456789");
  assert.equal(normalizePhone("03-1234 5678"), ""); // landline
  assert.equal(normalizePhone("012"), "");
});

test("validateOrder fills a default greeting and rejects bad input", () => {
  const ok = validateOrder(good);
  assert.equal(ok.ok, true);
  assert.equal(ok.order.cards[0].greeting, "Hi Ahmad, salam kenal! 👋");
  assert.equal(ok.order.cards[0].whatsapp, "60123456789");

  const bad = validateOrder({ pack: "1", cards: [{ name: "A", whatsapp: "x" }], delivery: "drone", agree: false });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["agree", "delivery", "name-0", "whatsapp-0"]);
});

test("validateOrder trims and caps long text", () => {
  const v = validateOrder({ ...good, cards: [{ ...card, name: "  " + "x".repeat(80), greeting: "y".repeat(500) }] });
  assert.equal(v.order.cards[0].name.length, 40);
  assert.equal(v.order.cards[0].greeting.length, 160);
});

test("session uses server prices: 1 card RM35, post to Semenanjung", () => {
  const p = buildSessionParams(validateOrder(good).order, "https://connectcard.binalab.my");
  assert.equal(p.line_items[0].price_data.unit_amount, 3500);
  assert.equal(p.line_items[0].quantity, 1);
  assert.equal(p.line_items[0].price_data.product_data.name, "Connect Card");
  assert.equal(p.line_items[0].price_data.currency, "myr");
  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, 800);
  assert.deepEqual(p.shipping_address_collection.allowed_countries, ["MY"]);
  const c1 = JSON.parse(p.metadata.card_1);
  assert.equal(c1.whatsapp, "60123456789");
  assert.match(c1.slug, /^ahmad-[a-z0-9]{4}$/);
  assert.equal(p.metadata.cards, "1");
  assert.equal(p.success_url, "https://connectcard.binalab.my/terima-kasih?id={CHECKOUT_SESSION_ID}");
  for (const v of Object.values(p.metadata)) assert.ok(String(v).length <= 500, "Stripe metadata limit");
});

test("session: Sabah/Sarawak RM12, pickup has no shipping but still pays online", () => {
  const ss = buildSessionParams(validateOrder({ ...good, delivery: "pos-ss" }).order, "https://x");
  assert.equal(ss.shipping_options[0].shipping_rate_data.fixed_amount.amount, 1200);
  const pu = buildSessionParams(validateOrder({ ...good, delivery: "pickup" }).order, "https://x");
  assert.equal(pu.shipping_options, undefined);
  assert.equal(pu.shipping_address_collection, undefined);
  assert.equal(pu.mode, "payment");
  assert.equal(pu.phone_number_collection.enabled, true);
});

test("checkout handler: 400 on bad form, 200 with Stripe URL, ignores client prices", async () => {
  let sent = null;
  const handler = createHandler(() => ({ checkout: { sessions: { create: async p => { sent = p; return { url: "https://checkout.stripe.com/c/pay/cs_test_123" }; } } } }));

  const r1 = mockRes();
  await handler({ method: "POST", headers: { host: "localhost" }, body: { name: "" } }, r1);
  assert.equal(r1.statusCode, 400);
  assert.ok(r1.json().fields["name-0"]);

  const r2 = mockRes();
  await handler({ method: "POST", headers: { host: "shop.test", "x-forwarded-proto": "https" }, body: { ...good, price: 1 } }, r2);
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().url, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.equal(sent.line_items[0].price_data.unit_amount, 3500);
  assert.equal(sent.cancel_url, "https://shop.test/#tempah");

  const r3 = mockRes();
  await handler({ method: "GET", headers: {} }, r3);
  assert.equal(r3.statusCode, 405);
});

test("packs: 3 cards RM89 and 5 cards RM139, each card validated and stored", () => {
  const three = [card, { name: "Siti", whatsapp: "+60 11-2345 6789", greeting: "Assalamualaikum Siti!" }, { name: "Raju", whatsapp: "019 876 5432" }];
  const v3 = validateOrder({ pack: "3", cards: three, delivery: "pos-ss", agree: true });
  assert.equal(v3.ok, true);
  const p3 = buildSessionParams(v3.order, "https://x");
  assert.equal(p3.line_items[0].price_data.unit_amount, 8900);
  assert.equal(p3.line_items[0].price_data.product_data.name, "Connect Card · Pek 3 kad");
  assert.equal(p3.shipping_options[0].shipping_rate_data.fixed_amount.amount, 1200); // one postage per order
  assert.equal(JSON.parse(p3.metadata.card_2).greeting, "Assalamualaikum Siti!");
  assert.equal(JSON.parse(p3.metadata.card_3).greeting, "Hi Raju, salam kenal! 👋");
  assert.equal(p3.metadata.card_4, undefined);

  const five = Array.from({ length: 5 }, (_, i) => ({ name: "Staf " + (i + 1), whatsapp: "01234567" + (10 + i), greeting: "y".repeat(160) }));
  const p5 = buildSessionParams(validateOrder({ pack: "5", cards: five, delivery: "pickup", agree: true }).order, "https://x");
  assert.equal(p5.line_items[0].price_data.unit_amount, 13900);
  for (const v of Object.values(p5.metadata)) assert.ok(String(v).length <= 500, "Stripe metadata limit");
  assert.ok(Object.keys(p5.metadata).length <= 50);
});

test("packs: wrong card count, unknown pack and an empty second card are rejected", () => {
  assert.equal(validateOrder({ pack: "3", cards: [card], delivery: "pos-sm", agree: true }).errors.pack, "Isi butiran untuk 3 kad.");
  assert.ok(validateOrder({ pack: "2", cards: [card, card], delivery: "pos-sm", agree: true }).errors.pack);
  assert.ok(validateOrder({ pack: "__proto__", cards: [card], delivery: "pos-sm", agree: true }).errors.pack);
  const e = validateOrder({ pack: "3", cards: [card, {}, card], delivery: "pos-sm", agree: true }).errors;
  assert.ok(e["name-1"] && e["whatsapp-1"]);
  assert.equal(e["name-0"], undefined);
});

test("checkout handler: friendly errors when Stripe is missing or fails", async () => {
  const noKey = createHandler(() => { throw new Error("no key"); });
  const r1 = mockRes();
  await noKey({ method: "POST", headers: { host: "x" }, body: good }, r1);
  assert.equal(r1.statusCode, 500);

  const failing = createHandler(() => ({ checkout: { sessions: { create: async () => { throw new Error("boom"); } } } }));
  const r2 = mockRes();
  await failing({ method: "POST", headers: { host: "x" }, body: good }, r2);
  assert.equal(r2.statusCode, 502);
});

test("tap: unknown or inactive card shows a 404 page, never a redirect", () => {
  const r1 = mockRes();
  tap({ query: { slug: "tiada" } }, r1);
  assert.equal(r1.statusCode, 404);
  const r2 = mockRes();
  tap({ query: { slug: "demo" } }, r2); // demo is inactive in data/cards.json
  assert.equal(r2.statusCode, 404);
  const r3 = mockRes();
  tap({ query: { slug: "__proto__" } }, r3);
  assert.equal(r3.statusCode, 404);
});

test("tap: active card redirects to wa.me with the greeting", () => {
  const cards = require("../data/cards.json");
  cards["test-aktif"] = { name: "Siti", whatsapp: "011-2345 6789", greeting: "Hai Siti! Salam kenal & selamat datang", active: true };
  const r = mockRes();
  tap({ query: { slug: "TEST-AKTIF" } }, r);
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, "https://wa.me/601123456789?text=" + encodeURIComponent("Hai Siti! Salam kenal & selamat datang"));
  assert.equal(r.headers["cache-control"], "no-store");
  delete cards["test-aktif"];
});
