// GET /t/<slug>  (rewritten to /api/tap?slug=<slug> in vercel.json)
// The URL written on each NFC chip. It sends the phone to the owner's WhatsApp
// with the greeting already typed, so the number or greeting can change without
// rewriting the card.
const CARDS = require("../data/cards.json");
const { normalizePhone } = require("../lib/order");

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function page(title, text) {
  return `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Connect Card</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0B;color:#F2F2F4;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;box-sizing:border-box;text-align:center}
main{max-width:360px;display:grid;gap:12px}h1{margin:0;font-size:22px;font-weight:600}p{margin:0;color:#A3A3AD;line-height:1.5}a{color:#F2F2F4}</style></head>
<body><main><h1>${esc(title)}</h1><p>${text}</p><p><a href="/">Tentang Connect Card</a></p></main></body></html>`;
}

function waUrl(card) {
  const phone = normalizePhone(card.whatsapp);
  if (!phone) return "";
  const text = card.greeting || `Hi ${card.name}, salam kenal! 👋`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

module.exports = function handler(req, res) {
  const slug = String((req.query && req.query.slug) || "").toLowerCase();
  const card = /^[a-z0-9-]{1,60}$/.test(slug) && Object.prototype.hasOwnProperty.call(CARDS, slug) ? CARDS[slug] : null;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  const url = card && card.active !== false ? waUrl(card) : "";
  if (!url) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(page("Kad belum aktif", "Kad ini belum diaktifkan atau telah dinyahaktif. Sila minta pemilik kad untuk menghubungi Connect Card."));
  }
  res.statusCode = 302;
  res.setHeader("Location", url);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(page("Membuka WhatsApp…", `Jika WhatsApp tidak terbuka, <a href="${esc(url)}">tekan di sini</a>.`));
};
