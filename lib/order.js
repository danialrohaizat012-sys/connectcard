// Order validation and Stripe Checkout parameters.
// Prices come only from public/prices.json on the server, never from the browser.
const PRICES = require("../public/prices.json");

const MAX_NAME = 40;
const MAX_GREETING = 160;

function cleanText(v, max) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "") // control characters, keep \n
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

// Accepts 012-345 6789, +6012..., 6012... and returns 6012XXXXXXX, or "" if not a Malaysian mobile number.
function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "6" + d;
  if (d.startsWith("1")) d = "60" + d;
  return /^601\d{8,9}$/.test(d) ? d : "";
}

function defaultGreeting(name) {
  return `Hi ${name}, salam kenal! 👋`;
}

function slugSuggestion(name) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "kad";
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${base}-${rand}`;
}

const rm = sen => "RM" + (sen / 100).toFixed(2);

// Body: { pack: "1"|"3"|"5", cards: [{ name, whatsapp, greeting }], delivery, agree }
// Error keys match the form's input ids: "name-0", "whatsapp-1", "pack", "delivery", "agree".
function validateOrder(body) {
  const b = body && typeof body === "object" ? body : {};
  const errors = {};
  const packKey = String(b.pack == null ? "1" : b.pack);
  const pack = Object.prototype.hasOwnProperty.call(PRICES.packs, packKey) ? PRICES.packs[packKey] : null;
  const delivery = String(b.delivery || "");
  const rawCards = Array.isArray(b.cards) ? b.cards : [];

  if (!pack) errors.pack = "Pilih pek.";
  const n = pack ? pack.cards : 1;
  if (pack && rawCards.length !== n) errors.pack = `Isi butiran untuk ${n} kad.`;

  const cards = [];
  for (let i = 0; i < n; i++) {
    const c = rawCards[i] && typeof rawCards[i] === "object" ? rawCards[i] : {};
    const name = cleanText(c.name, MAX_NAME);
    const whatsapp = normalizePhone(c.whatsapp);
    const greeting = cleanText(c.greeting, MAX_GREETING) || (name ? defaultGreeting(name) : "");
    if (name.length < 2) errors[`name-${i}`] = "Isi nama paparan (sekurang-kurangnya 2 huruf).";
    if (!whatsapp) errors[`whatsapp-${i}`] = "Isi nombor WhatsApp Malaysia yang sah, contoh 012-345 6789.";
    if (!greeting) errors[`greeting-${i}`] = "Isi ayat salam.";
    cards.push({ name, whatsapp, greeting });
  }
  if (!PRICES.delivery[delivery]) errors.delivery = "Pilih cara penghantaran.";
  if (b.agree !== true) errors.agree = "Sila setuju dengan terma dan polisi.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, order: { pack: packKey, cards, delivery } };
}

function buildSessionParams(order, siteUrl) {
  const d = PRICES.delivery[order.delivery];
  const pack = PRICES.packs[order.pack];
  const names = order.cards.map(c => c.name).join(", ");

  // One metadata key per card (Stripe allows 50 keys of up to 500 characters each)
  const meta = { pack: order.pack, cards: String(order.cards.length), delivery: order.delivery };
  order.cards.forEach((c, i) => {
    meta[`card_${i + 1}`] = JSON.stringify({ name: c.name, whatsapp: c.whatsapp, greeting: c.greeting, slug: slugSuggestion(c.name) });
  });

  const productName = pack.cards === 1 ? PRICES.product.name : `${PRICES.product.name} · ${pack.label}`;
  const params = {
    mode: "payment",
    locale: "auto",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PRICES.currency,
          unit_amount: pack.price,
          product_data: {
            name: productName,
            description: `${PRICES.product.description}. Untuk: ${names}`.slice(0, 500),
          },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    metadata: meta,
    payment_intent_data: {
      metadata: meta,
      description: `Connect Card · ${pack.label} (${rm(pack.price)}) · ${d.label}`,
    },
    success_url: `${siteUrl}/terima-kasih?id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/#tempah`,
    custom_text: {
      submit: {
        message: d.ship
          ? "Kad akan diprogram, diuji dan dipos ke alamat di atas. Kami akan WhatsApp anda jika ada pertanyaan."
          : "Pick up di Kota Bharu. Kami akan WhatsApp anda untuk tetapkan lokasi dan masa ambil.",
      },
    },
  };
  if (d.ship) {
    params.shipping_address_collection = { allowed_countries: ["MY"] };
    params.shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: d.label,
          fixed_amount: { amount: d.fee, currency: PRICES.currency },
        },
      },
    ];
  }
  return params;
}

module.exports = { PRICES, normalizePhone, defaultGreeting, validateOrder, buildSessionParams, MAX_GREETING, MAX_NAME };
