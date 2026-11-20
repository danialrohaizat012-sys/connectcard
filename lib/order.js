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
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

function validateOrder(body) {
  const b = body && typeof body === "object" ? body : {};
  const errors = {};
  const name = cleanText(b.name, MAX_NAME);
  const whatsapp = normalizePhone(b.whatsapp);
  const greeting = cleanText(b.greeting, MAX_GREETING) || (name ? defaultGreeting(name) : "");
  const delivery = String(b.delivery || "");

  if (name.length < 2) errors.name = "Isi nama paparan (sekurang-kurangnya 2 huruf).";
  if (!whatsapp) errors.whatsapp = "Isi nombor WhatsApp Malaysia yang sah, contoh 012-345 6789.";
  if (!greeting) errors.greeting = "Isi ayat salam.";
  if (!PRICES.delivery[delivery]) errors.delivery = "Pilih cara penghantaran.";
  if (b.agree !== true) errors.agree = "Sila setuju dengan terma dan polisi.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, order: { name, whatsapp, greeting, delivery } };
}

function buildSessionParams(order, siteUrl) {
  const d = PRICES.delivery[order.delivery];
  const meta = {
    card_name: order.name,
    card_whatsapp: order.whatsapp,
    card_greeting: order.greeting,
    delivery: order.delivery,
    slug_suggestion: slugSuggestion(order.name),
  };
  const params = {
    mode: "payment",
    locale: "auto",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PRICES.currency,
          unit_amount: PRICES.product.price,
          product_data: {
            name: PRICES.product.name,
            description: `${PRICES.product.description}. Nama pada draf: ${order.name}`,
          },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    metadata: meta,
    payment_intent_data: { metadata: meta, description: `Connect Card · ${order.name} · ${d.label}` },
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
