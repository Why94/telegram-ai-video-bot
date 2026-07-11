// ─── TikTok Affiliator ───────────────────────────────────────────────────────
// Generates TikTok affiliate content: script, caption, hashtags, thumbnail ideas.

const CATEGORIES = {
  skincare: {
    keywords: ["skincare", "serum", "wajah", "face", "cream", "moisturizer",
      "sunscreen", "toner", "masker", "glowing", "jerawat", "acne",
      "vitamin c", "retinol", "lipstik", "makeup", "bedak"],
    hooks: [
      "3 detik langsung glowing? 😱",
      "Diam aja atau glowing? Pilih sendiri!",
      "Rahasia kulit mulus tanpa mahal 🫢",
      "Produk ini viral di TikTok! Cobain sebelum kehabisan",
      "Ini dia skincare andalan seleb ❤️",
      "Bikin orang di kampus tanya 'pake apa?'",
      "From zero to hero — transformasi kulit 7 hari",
      "Jangan beli sebelum nonton ini!",
    ],
    hashtags: ["#skincare", "#skincareroutine", "#glowingskin",
      "#skincaretips", "#koreanskincare", "#beautytips",
      "#skincareindonesia", "#fyp", "#viral", "#glowing",
      "#skincareproducts", "#koreanbeauty"],
  },
  fashion: {
    keywords: ["baju", "fashion", "outfit", "sepatu", "shoes", "tas", "bag",
      "hoodie", "kaos", "gamis", "hijab", "stelan", "pakaian",
      "jaket", "jeans", "sweater", "dress"],
    hooks: [
      "Outfit ini bikin fed-up followers mu 😎",
      "Modal 50rb dapet look 5 juta!",
      "Styling murah tapi keliatan mahal ✨",
      "Rekomendasi outfit auto naik kelas",
      "Jangan pake ini kalo ga mau di-like terus",
      "Mix & match 3 item jadi 7 outfit!",
      "Beli sekarang, besok udah bisa dipake",
      "Ini dia outfit andalan anak kos 🫵",
    ],
    hashtags: ["#fashion", "#ootd", "#outfitideas", "#fashiontips",
      "#streetwear", "#viral", "#fashionindonesia",
      "#styling", "#lookbook", "#tiktokfashion", "#fyp"],
  },
  electronics: {
    keywords: ["hp", "handphone", "gadget", "earphone", "headset", "speaker",
      "laptop", "keyboard", "mouse", "charger", "powerbank",
      "smartphone", "iphone", "android", "casing", "tripod",
      "earphone", "bluetooth", "kamera", "tech"],
    hooks: [
      "Gajian? Jangan lupa upgrade gadget! 📱",
      "Review jujur, worth it atau gak?",
      "Ini dia barang tech yang wajib lu punya!",
      "Harga segini dapet segitu? Gas!",
      "Tech under 100rb yang bikin hidup lu lebih gampang",
      "Produk tech viral — beli atau skip?",
      "Jangan beli ini kalo gak mau boros 🫣",
    ],
    hashtags: ["#gadget", "#technology", "#techreview", "#electronics",
      "#gadgetindonesia", "#viral", "#fyp", "#hometech",
      "#smartphone", "#earphone", "#gaming"],
  },
  food: {
    keywords: ["makanan", "minuman", "snack", "camilan", "kopi", "teh",
      "makan", "minum", "healthy", "diet", "protein", "sereal",
      "bumbu", "instan", "coklat", "sehat", "susu"],
    hooks: [
      "Jangan dimakan kalo gak mau nagih! 🤤",
      "Cemilan viral yang wajib ada di kos!",
      "3 detik langsung ludes 🤯",
      "Rekomendasi makanan anak kos — murah meriah",
      "Enak banget, sampe lupa diet!",
      "Cobain sekali pasti repeat order terus",
      "Ini rahasia chef — makanan simple tapi mewah",
    ],
    hashtags: ["#food", "#foodie", "#snack", "#makananviral",
      "#cemilan", "#minuman", "#viral", "#fyp",
      "#makananenak", "#foodindonesia", "#resep"],
  },
  fitness: {
    keywords: ["fitness", "gym", "olahraga", "sport", "dumbbell", "matras",
      "yoga", "lari", "running", "sepatu olahraga", "protein",
      "preworkout", "gymbag", "botol", "tumbler"],
    hooks: [
      "Modal 50rb bisa gym di rumah! 💪",
      "Rahasia body goals tanpa personal trainer!",
      "Alat fitness murah yang wajib punya",
      "Fitnes di rumah? Bisa banget pake ini!",
      "Gerakan 5 menit — efeknya seharian",
      "Jangan mulai gym sebelum nonton ini!",
    ],
    hashtags: ["#fitness", "#gym", "#workout", "#bodygoals",
      "#fitnessindonesia", "#olahraga", "#viral",
      "#fyp", "#homeworkout", "#gymtips"],
  },
  home: {
    keywords: ["rumah", "home", "dekorasi", "furniture", "perabot",
      "hiasan", "lampu", "karpet", "bantal", "gorden",
      "rak", "meja", "kursi", "lemari", "daster"],
    hooks: [
      "Kos jadi estetik cuma modal 100rb! 🏠",
      "Dekorasi ulang rumah — budget minim hasil maximum",
      "Produk home ini lagi viral di TikTok!",
      "Bikin kamar nyaman tanpa renovasi",
      "Barang ini bikin rumah keliatan lebih mahal",
    ],
    hashtags: ["#homedecor", "#dekorasi", "#rumahminimalis",
      "#hometips", "#viral", "#fyp", "#interiordesign",
      "#rumahidaman", "#aesthetic"],
  },
};

function detectCategory(product) {
  const lower = product.toLowerCase();
  for (const [cat, data] of Object.entries(CATEGORIES)) {
    for (const kw of data.keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return null;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTikTokContent(product, category) {
  const catData = category && CATEGORIES[category] ? CATEGORIES[category] : null;
  const hook = catData ? pick(catData.hooks) : `Coba ${product} — dijamin puas! 🔥`;
  const ctaOptions = [
    "Langit beli di link bio! 🛍️",
    "Buruan checkout sebelum kehabisan!",
    "Gaskeun beli sekarang, link di bio!",
    "Jangan sampe nyesel, link udah di bio!",
    "Cuss langsung klik link di bio!",
  ];

  const script =
    `━━━ *SCRIPT VIDEO 30 DETIK* ━━━\n\n` +
    `[0:00-0:03] ${hook}\n\n` +
    `[0:03-0:10] Perkenalan produk\n` +
    `"Hari ini aku mau review ${product}"\n` +
    `Tunjukin produk dari berbagai angle\n\n` +
    `[0:10-0:20] Tunjukin cara pakai / detail\n` +
    `"Yang bikin ${product} ini worth it:"\n` +
    `• Poin 1 — jelaskan keunggulan\n` +
    `• Poin 2 — kenapa harus beli\n` +
    `• Poin 3 — harga terjangkau\n\n` +
    `[0:20-0:28] Hasil / Testimoni\n` +
    `"Pake ${product} selama seminggu hasilnya..."\n` +
    `Tunjukin before-after / hasil nyata\n\n` +
    `[0:28-0:30] CTA\n` +
    pick(ctaOptions);

  const caption =
    `🔥 ${hook}\n\n` +
    `${product} yang lagi viral banget!\n\n` +
    `Wajib punya! Jangan sampai kehabisan 🫶\n\n` +
    `👇 Langsung checkout di link bio!`;

  const hashtags = catData ? [...catData.hashtags].sort(() => Math.random() - 0.5).slice(0, 8) : ["#fyp", "#viral", "#recommendation"];

  const thumbnail =
    `📸 *IDE THUMBNAIL:*\n` +
    `• "${hook.slice(0, 30)}..." (teks besar)\n` +
    `• Produk dipegang dengan background cerah\n` +
    `• Ekspresi kaget/senang 👀`;

  return { hook, script, caption, hashtags, thumbnail };
}

module.exports = { CATEGORIES, detectCategory, generateTikTokContent };
