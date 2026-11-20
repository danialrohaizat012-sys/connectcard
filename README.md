# Connect Card

Website jualan Connect Card (`connectcard.binalab.my`) dan pautan tap NFC. Produk BinaLab.

Kad PVC hitam dengan NFC. Bila orang tap kad, WhatsApp pemilik terbuka dengan ayat salam siap ditaip. Orang itu tekan Hantar sendiri. Tiada QR buat masa ini.

## Struktur

```
public/              dihoskan kepada umum
  index.html         landing page dan borang tempahan
  terima-kasih.html  selepas bayaran berjaya
  polisi.html        terma, penghantaran, bayaran balik, privasi
  prices.json        harga dan caj pos (satu sumber untuk website dan server)
api/
  checkout.js        POST /api/checkout -> buat sesi Stripe Checkout
  tap.js             GET /t/<slug> -> hala ke WhatsApp pemilik kad
lib/order.js         validasi borang dan parameter Stripe
data/cards.json      senarai kad aktif (TIDAK dihoskan kepada umum)
test/                ujian (npm test)
```

`vercel.json` set `outputDirectory: public`, jadi hanya folder `public/` dihoskan. `data/cards.json` hanya dibaca oleh fungsi `api/tap.js`, supaya senarai nombor pelanggan tidak boleh dimuat turun.

## Harga

Ubah dalam `public/prices.json` sahaja (dalam sen):

| | Harga |
|---|---|
| Connect Card Standard | RM29 |
| Pos Semenanjung | RM8 |
| Pos Sabah, Sarawak dan Labuan | RM12 |
| Pick up Kota Bharu | RM0 (tetap bayar online) |

Server sentiasa kira harga dari fail ini. Harga yang dihantar dari browser diabaikan.

## Setup di Vercel

1. Import repo ini di Vercel (Framework: Other).
2. **Settings → Environment Variables**:
   - `STRIPE_SECRET_KEY`: kunci rahsia Stripe. Mula dengan `sk_test_...` untuk uji, tukar ke `sk_live_...` bila lancar.
   - `SITE_URL`: `https://connectcard.binalab.my` (untuk pautan kembali dari Stripe).
3. **Settings → Domains**: tambah `connectcard.binalab.my`. Di DNS `binalab.my`, tambah rekod `CNAME connectcard → cname.vercel-dns.com`.
4. Redeploy.

## Setup di Stripe

1. **Settings → Payment methods**: hidupkan kaedah yang mahu ditawarkan, contohnya kad, FPX, GrabPay. Checkout akan papar yang aktif sahaja.
2. **Settings → Customer emails**: hidupkan resit untuk pembayaran berjaya.
3. **Settings → Team and security → Notifications**: hidupkan emel untuk pembayaran berjaya, supaya anda tahu bila ada tempahan.
4. Uji dengan kad ujian `4242 4242 4242 4242` dalam mod test sebelum guna kunci live.

## Proses setiap tempahan (sasaran ~10 minit)

1. Stripe Dashboard → **Payments** → buka bayaran baru. Di **Metadata**:
   - `card_name`, `card_whatsapp`, `card_greeting`: butiran untuk kad
   - `delivery`: `pos-sm`, `pos-ss` atau `pickup`
   - `slug_suggestion`: cadangan pautan kad, contoh `ahmad-k3x9`
   - Alamat pos dan nombor telefon pembeli ada di bahagian **Shipping** dan **Customer**.
2. Tambah kad dalam `data/cards.json`, kemudian commit dan push. Vercel deploy semula secara automatik.
   ```json
   "ahmad-k3x9": {
     "name": "Ahmad",
     "whatsapp": "60123456789",
     "greeting": "Hi Ahmad, salam kenal! 👋",
     "active": true
   }
   ```
3. Tulis URL `https://connectcard.binalab.my/t/ahmad-k3x9` ke dalam cip NFC guna app seperti NFC Tools (rekod **URL**). Kunci cip (lock) hanya selepas yakin URL betul.
4. Uji tap pada **iPhone dan Android**. Chat mesti terbuka dengan ayat salam.
5. Pos kad, atau WhatsApp pembeli untuk tetapkan masa pick up di Kota Bharu.

**Tukar nombor atau ayat salam:** edit entri dalam `data/cards.json` dan push. Kad tidak perlu ditulis semula.
**Nyahaktif kad:** set `"active": false`. Orang yang tap akan nampak "Kad belum aktif".

Slug ialah pautan kekal dalam cip. Jangan tukar atau padam slug kad yang sudah dijual, dan pastikan domain ini kekal hidup selagi kad digunakan.

## Uji secara lokal

```bash
npm install
npm test
```

Untuk jalankan penuh secara lokal termasuk fungsi `api/`, guna `npx vercel dev` dengan `STRIPE_SECRET_KEY` ujian dalam fail `.env`.

## Perlu diisi sebelum lancar

- Emel dan nombor WhatsApp BinaLab dalam `public/polisi.html` (bahagian Hubungi kami). Stripe memerlukan maklumat hubungan dan polisi bayaran balik.
- Semak teks terma dan polisi bersama keadaan sebenar perniagaan.
- Kad demo dalam `data/cards.json`: tukar ke nombor sendiri dan set `"active": true`.
