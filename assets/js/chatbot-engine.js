// ===== Cosme Outlet — chatbot engine (สมองของ "แอดมินคอสเม่") =====
// ไม่มี DOM / ไม่เรียก API — รับคำถาม + รายการสินค้า แล้วคืนคำตอบ จึงทดสอบด้วย node ได้
//
//   const reply = CosmeBotEngine.respond(text, products, session);
//   reply = { text, products: [{...product, note}], suggestions: [...], moreLink }
//
// แนวคิดหลัก (แก้ปัญหาเดิมที่ตอบสินค้าตัวเดิมซ้ำ ๆ และไม่ตรงคำถาม):
//  1. แยกคำถามเป็น "เงื่อนไข" — หมวด, ชนิดสินค้า (ลิป/เซรั่ม/กันแดด…), กลิ่น/สรรพคุณ, เพศ, ขนาด,
//     งบประมาณ, ยี่ห้อ — แล้วให้คะแนนสินค้าทีละชิ้นตามเงื่อนไขทั้งหมดพร้อมกัน
//  2. ภาษาไทยไม่มีเว้นวรรค: ใช้พจนานุกรมคำสำคัญ (longest-match) + Intl.Segmenter กับคำที่เหลือ
//  3. สินค้าเดียวกันหลายขนาดถูกรวมเป็นกลุ่มเดียว เพื่อไม่ให้ผลลัพธ์ซ้ำกัน
//  4. จำสิ่งที่เคยแนะนำในแชทนี้ (session) — ถามซ้ำ/พิมพ์ "อีก" จะได้ตัวใหม่ และต่อบทสนทนาได้
//     เช่น "แนะนำน้ำหอม" → "กลิ่นหวานๆ" → "ถูกกว่านี้หน่อย"

const CosmeBotEngine = (() => {
  'use strict';

  const BOT_NAME = 'แอดมินคอสเม่';
  const PAGE = 4;
  const BEAUTY = ['perfume', 'skincare', 'cosmetics'];
  const CAT_LABEL = {
    perfume: 'น้ำหอม', skincare: 'สกินแคร์', cosmetics: 'เครื่องสำอางค์',
    bags: 'กระเป๋า', pouches: 'ถุง', food: 'อาหาร', supplements: 'อาหารเสริม', general: 'ทั่วไป',
  };

  const SHOP = {
    hours: 'ร้านเปิดทุกวันเลยจ้า~ 🕐\nจันทร์-ศุกร์ 09:00-21:00 น.\nเสาร์-อาทิตย์ 10:00-21:00 น.\nทักแชทได้ตลอดเลยนะ ปกติตอบไวภายใน 30 นาทีค่ะ 💕',
    contact: 'ทักหาแอดมินตัวจริงได้หลายช่องทางเลยจ้า 🥰\n💬 LINE OA: @cosmeoutlet\n📘 Facebook: facebook.com/cosmeoutlet\n📸 Instagram: instagram.com/cosmeoutlet\n\nดู QR Code ได้ที่หน้า "ติดต่อร้าน" ด้วยน้า ✨',
    order: 'สั่งซื้อง่ายมากค่ะ 3 ขั้นตอนเอง 🛍️\n1️⃣ เลือกสินค้าที่ชอบจากหน้า "สินค้าของเรา"\n2️⃣ ทักแชทมาทาง LINE OA หรือ Facebook\n3️⃣ แจ้งที่อยู่ + ชำระเงิน รอรับของได้เลยจ้า 💖',
    shipping: 'ร้านจัดส่งทั่วประเทศค่ะ 📦 ค่าส่งและระยะเวลาขึ้นอยู่กับพื้นที่และขนส่งที่เลือก ขอให้แอดมินตัวจริงเช็กยอดให้ทาง LINE @cosmeoutlet จะชัวร์ที่สุดน้า ✨',
    human: 'เรื่องนี้ขอให้แอดมินตัวจริงดูแลให้ดีกว่าค่ะ 🥰 ทักได้ที่ LINE @cosmeoutlet หรือ Facebook cosmeoutlet เลยน้า (ปกติตอบภายใน 30 นาที)',
    authentic: 'สินค้าของร้านเป็นของแท้นะคะ 💖 ถ้าอยากเช็กรายละเอียดเฉพาะตัวไหน (เช่น ป้ายห้าง/ล็อตผลิต) ทักแอดมินตัวจริงทาง LINE @cosmeoutlet ได้เลยค่ะ',
    about: `หนูคือ "${BOT_NAME}" ผู้ช่วยอัตโนมัติของร้าน Cosme Outlet ค่ะ 💕 ช่วยหาน้ำหอม สกินแคร์ เครื่องสำอางค์ ตามกลิ่น งบ และสไตล์ที่ชอบได้เลย ถ้าอยากคุยกับแอดมินตัวจริงทักไลน์ @cosmeoutlet ได้น้า`,
  };

  // ---------------------------------------------------------------- text utils
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ๆ/g, ' ')
      .replace(/(\d)\s+(ml|g|กรัม|มล)\b/g, '$1$2')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9฀-๿.]+/g, ' ')
      .replace(/\.(?!\d)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const isLatin = (t) => /^[a-z0-9 .]+$/.test(t);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reCache = new Map();
  function wordRe(t) {
    if (!reCache.has(t)) reCache.set(t, new RegExp(`(^|[^a-z0-9])${esc(t)}([^a-z0-9]|$)`));
    return reCache.get(t);
  }
  // มี term อยู่ใน text ไหม (อังกฤษคำสั้น ๆ ต้องเป็นคำเต็ม กันมั่ว เช่น "uv" ใน "luv")
  function has(text, term) {
    if (!term) return false;
    if (isLatin(term) && term.length <= 4) return wordRe(term).test(text);
    return text.includes(term);
  }
  function count(text, term) {
    if (!term) return 0;
    let n = 0; let i = 0;
    while ((i = text.indexOf(term, i)) !== -1) { n += 1; i += term.length; if (n >= 5) break; }
    return n;
  }
  const money = (n) => `฿${Math.round(n).toLocaleString('th-TH')}`;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function segment(s) {
    if (!segmenter) return s.split(' ');
    const out = [];
    for (const seg of segmenter.segment(s)) if (seg.isWordLike) out.push(seg.segment);
    return out;
  }

  const STOP = new Set(['ค่ะ', 'คะ', 'ครับ', 'คับ', 'จ้า', 'จ้ะ', 'นะ', 'น้า', 'หน่อย', 'ด้วย', 'ไหม', 'มั้ย', 'หรือ', 'เปล่า', 'มี', 'อยาก', 'อยากได้', 'ได้', 'ต้องการ',
    'หา', 'ขอ', 'แนะนำ', 'ช่วย', 'ดู', 'ให้', 'ที่', 'ของ', 'เป็น', 'แบบ', 'ตัว', 'อัน', 'อะไร', 'บ้าง', 'ไหน', 'ดี', 'เอา', 'จะ', 'ซื้อ', 'สั่ง', 'สินค้า',
    'รุ่น', 'ยี่ห้อ', 'กลิ่น', 'และ', 'กับ', 'แต่', 'ก็', 'มัน', 'นี้', 'นั้น', 'อีก', 'หน่อยค่ะ', 'ครับผม', 'เลย', 'สัก', 'ชิ้น', 'ทั้งหมด', 'ทุก', 'อยู่', 'ใช้', 'เหมาะ',
    'สำหรับ', 'ใคร', 'เท่าไหร่', 'เท่าไร', 'กี่', 'บาท', 'ราคา', 'งบ', 'ประมาณ', 'ขอบคุณ', 'หน่อยนะ', 'แล้ว', 'ไม่', 'ใช่', 'the', 'and', 'for', 'ml',
    'สวัสดี', 'หวัดดี', 'ดีจ้า', 'ฮัลโหล', 'hello', 'hey', 'ผม', 'ฉัน', 'หนู', 'เรา', 'ดิฉัน', 'พี่', 'น้อง', 'คุณ', 'เธอ', 'แม่', 'ตอนนี้', 'วันนี้', 'จ้าา', 'ค่า',
    'กว่า', 'ลด', 'หน่อยนะ', 'เพิ่ม', 'ขึ้น', 'ลง', 'มาก', 'คร้าบ', 'อ่ะ', 'อะ', 'เหรอ', 'หรอ', 'รึเปล่า', 'ขอดู', 'ขอถาม', 'ถาม', 'อยากรู้', 'บอก', 'พอ', 'จัด', 'ที', 'ซักตัว', 'สักตัว', 'ตัวนึง', 'ตัวหนึ่ง', 'ชุด']);

  // ---------------------------------------------------------------- lexicon
  // kind: cat (หมวด) | type (ชนิดสินค้า — เทียบกับ "ชื่อ" เป็นหลัก) | attr (กลิ่น/สรรพคุณ — เทียบกับชื่อ+คำอธิบาย)
  //       gender | size | pref | gift
  const L = [];
  const add = (id, kind, label, triggers, o = {}) => L.push({ id, kind, label, triggers, ...o });

  add('cat:perfume', 'cat', 'น้ำหอม', ['น้ำหอม', 'สเปรย์น้ำหอม', 'perfume', 'fragrance', 'edp', 'edt', 'parfum', 'cologne'], { value: 'perfume' });
  add('cat:skincare', 'cat', 'สกินแคร์', ['สกินแคร์', 'skincare', 'skin care', 'บำรุงผิว', 'บำรุงหน้า', 'ผิวหน้า'], { value: 'skincare' });
  add('cat:cosmetics', 'cat', 'เครื่องสำอางค์', ['เครื่องสำอางค์', 'เครื่องสำอาง', 'เมคอัพ', 'เมค อัพ', 'makeup', 'make up', 'แต่งหน้า', 'cosmetics'], { value: 'cosmetics' });
  add('cat:supplements', 'cat', 'อาหารเสริม', ['อาหารเสริม', 'supplement'], { value: 'supplements' });
  add('cat:food', 'cat', 'อาหาร', ['อาหาร', 'ของกิน', 'เครื่องดื่ม'], { value: 'food' });
  add('cat:bags', 'cat', 'กระเป๋า', ['กระเป๋า', 'bag'], { value: 'bags' });
  add('cat:pouches', 'cat', 'ถุง', ['ถุงช้อปปิ้ง', 'ถุงกระดาษ', 'ถุง'], { value: 'pouches' });

  // ---- ชนิดสินค้า
  add('type:lip', 'type', 'ลิป', ['ลิปสติก', 'ลิปบาล์ม', 'ลิปทินท์', 'ลิปมัน', 'ลิปกลอส', 'ลิป', 'lipstick', 'lip gloss', 'lip'], { name: ['ลิป', 'lip', 'tint', 'ทินท์'], cat: 'cosmetics' });
  add('type:sunscreen', 'type', 'ครีมกันแดด', ['ครีมกันแดด', 'กันแดด', 'sunscreen', 'sunblock', 'spf', 'uv'], { name: ['กันแดด', 'spf', 'sunscreen', 'uv', 'sun'], cat: 'skincare' });
  add('type:serum', 'type', 'เซรั่ม', ['เซรั่ม', 'เอสเซนส์', 'แอมพูล', 'serum', 'essence', 'ampoule'], { name: ['เซรั่ม', 'serum', 'essence', 'เอสเซนส์', 'ampoule', 'แอมพูล'], cat: 'skincare' });
  add('type:cleanser', 'type', 'โฟม/เจล/ออยล์ล้างหน้า', ['ล้างเครื่องสำอาง', 'เช็ดเครื่องสำอาง', 'ล้างเมคอัพ', 'รีมูฟเมคอัพ', 'คลีนซิ่งออยล์', 'ออยล้างหน้า', 'บาล์มล้างหน้า', 'โฟมล้างหน้า', 'เจลล้างหน้า', 'มูสล้างหน้า', 'ล้างหน้า', 'คลีนซิ่ง', 'cleanser', 'cleansing', 'micellar'],
    { name: ['ล้างหน้า', 'cleans', 'โฟม', 'foam', 'micellar', 'คลีนซิ่ง', 'เช็ดเครื่องสำอาง', 'มูส', 'ออยล้าง'], cat: 'skincare' });
  add('type:collagen', 'type', 'คอลลาเจน', ['คอลลาเจน', 'collagen'], { name: ['คอลลาเจน', 'collagen'], cat: 'supplements' });
  add('type:vitamin', 'type', 'วิตามิน', ['วิตามิน', 'vitamin', 'วิตซี'], { name: ['วิตามิน', 'vitamin', 'zinc', 'ซิงค์'], cat: 'supplements' });
  add('type:ramen', 'type', 'ราเมน', ['ราเมน', 'ramen', 'บะหมี่', 'มาม่า'], { name: ['ราเมน', 'ramen', 'บะหมี่'], cat: 'food' });
  add('type:snack', 'type', 'ขนม', ['ขนม', 'คุกกี้', 'ช็อกโกแลต', 'ช็อคโกแลต', 'snack', 'cookie'], { name: ['ขนม', 'คุกกี้', 'cookie', 'ช็อก', 'chocolate', 'snack', 'nuts', 'ถั่ว'], cat: 'food' });
  add('type:handcream', 'type', 'แฮนด์ครีม', ['แฮนด์ครีม', 'ครีมทามือ', 'hand cream', 'handcream'], { name: ['แฮนด์', 'hand'], cat: 'skincare' });
  add('type:eyecream', 'type', 'อายครีม', ['อายครีม', 'eye cream', 'ใต้ตา', 'รอบดวงตา', 'ตาคล้ำ', 'ถุงใต้ตา'], { name: ['อาย', 'eye', 'ตา'], cat: 'skincare' });
  add('type:cream', 'type', 'ครีมบำรุง', ['ครีมบำรุง', 'ครีมทาหน้า', 'มอยเจอร์ไรเซอร์', 'moisturizer', 'ครีม', 'cream'], { name: ['ครีม', 'cream', 'moistur'], cat: 'skincare' });
  add('type:bodylotion', 'type', 'โลชั่น', ['โลชั่นน้ำหอม', 'บอดี้โลชั่น', 'body lotion', 'โลชั่นทาตัว', 'โลชั่น', 'lotion'], { name: ['โลชั่น', 'lotion'] });
  add('type:bodymist', 'type', 'บอดี้มิสต์', ['บอดี้มิสต์', 'body mist', 'สเปรย์ฉีดตัว', 'มิสต์'], { name: ['mist', 'สเปรย์ฉีดตัว', 'บอดี้มิสต์', 'สเปรย์'], cat: 'perfume' });
  add('type:mask', 'type', 'มาสก์', ['มาส์กหน้า', 'มาสก์หน้า', 'มาสก์', 'มาส์ก', 'มาส์ค', 'sleeping mask', 'mask'], { name: ['มาสก์', 'มาส์ก', 'มาส์ค', 'mask'] });
  add('type:toner', 'type', 'โทนเนอร์/น้ำตบ', ['โทนเนอร์', 'น้ำตบ', 'toner'], { name: ['toner', 'โทนเนอร์', 'น้ำตบ'], cat: 'skincare' });
  add('type:hair', 'type', 'ผลิตภัณฑ์ดูแลผม', ['ผมเสีย', 'ผมแห้ง', 'ผมร่วง', 'ผมชี้ฟู', 'ผมทำสี', 'ผมฟอก', 'ผมหยาบ', 'บำรุงผม', 'เส้นผม', 'สระผม', 'ทรีตเมนต์', 'แชมพู', 'ครีมนวด', 'shampoo', 'conditioner', 'hair'],
    { name: ['shampoo', 'แชมพู', 'hair', 'ผม', 'conditioner', 'ครีมนวด', 'olaplex', 'kerastase', 'rastase', 'treatment', 'ทรีตเมนต์'] });
  add('type:base', 'type', 'รองพื้น/แป้ง', ['รองพื้น', 'คุชชั่น', 'คอนซีลเลอร์', 'ไพรเมอร์', 'แป้งพัฟ', 'แป้ง', 'foundation', 'cushion', 'concealer', 'primer', 'powder'], { name: ['รองพื้น', 'foundation', 'cushion', 'คุชชั่น', 'concealer', 'คอนซีลเลอร์', 'แป้ง', 'powder', 'primer', 'ไพรเมอร์'], cat: 'cosmetics' });
  add('type:eye', 'type', 'เครื่องสำอางค์ดวงตา', ['มาสคาร่า', 'อายไลเนอร์', 'อายแชโดว์', 'อายแชโดว', 'ขนตา', 'คิ้ว', 'mascara', 'eyeliner', 'eyeshadow', 'brow'], { name: ['มาสคาร่า', 'mascara', 'eyeliner', 'อายไลเนอร์', 'eyeshadow', 'อายแชโดว์', 'ขนตา', 'คิ้ว', 'brow'], cat: 'cosmetics' });
  add('type:blush', 'type', 'บลัช/ไฮไลต์', ['บลัชออน', 'บลัช', 'ไฮไลต์', 'ไฮไลท์', 'ปัดแก้ม', 'คอนทัวร์', 'blush', 'highlighter', 'highlight', 'contour'], { name: ['บลัช', 'blush', 'ไฮไลต์', 'ไฮไลท์', 'highlight', 'dew', 'คอนทัวร์', 'contour'], cat: 'cosmetics' });
  add('type:set', 'type', 'เซ็ต/กล่อง', ['เซ็ต', 'ชุดเซ็ต', 'กล่องเซ็ต', 'set', 'kit', 'คิต'], { name: ['เซ็ต', 'set', 'kit', 'box', 'กล่อง', 'collection', 'coffret'] });
  add('type:perfumeOil', 'type', 'น้ำหอมกลิ่น/แบบขวดเต็ม', ['ขวดเต็ม', 'ขนาดเต็ม', 'full size', 'ขวดใหญ่', 'ไซส์ใหญ่', 'ขนาดใหญ่'], { size: 'large' });

  // ---- ขนาด
  add('size:small', 'size', 'ขวดเล็ก/แบ่งขาย', ['ขวดเล็ก', 'ขนาดเล็ก', 'ไซส์เล็ก', 'ลองกลิ่น', 'ขนาดทดลอง', 'ทดลอง', 'แบ่งขาย', 'ขวดแบ่ง', 'มินิ', 'เทสเตอร์', 'พกพา', 'mini', 'vial', 'travel'], { size: 'small' });

  // ---- ความต้องการด้านราคา
  add('pref:cheap', 'pref', 'ราคาประหยัด', ['ราคาถูก', 'ราคาน่ารัก', 'ไม่แพง', 'ประหยัด', 'งบน้อย', 'นักเรียน', 'คุ้มๆ', 'คุ้มค่า', 'ถูกๆ', 'ถูกสุด', 'ถูกที่สุด', 'ถูก', 'คุ้ม'], { pref: 'cheap' });
  add('pref:premium', 'pref', 'ระดับพรีเมียม', ['พรีเมียม', 'ไฮเอนด์', 'luxury', 'หรูหรา', 'หรู', 'ราคาสูง', 'แพงสุด', 'แพงที่สุด', 'แพง'], { pref: 'premium' });

  // ---- เพศ
  add('gender:men', 'gender', 'สำหรับผู้ชาย', ['แฟนหนุ่ม', 'ผู้ชาย', 'สุภาพบุรุษ', 'ลูกผู้ชาย', 'หนุ่มๆ', 'หนุ่ม', 'สามี', 'พ่อ', 'pour homme', 'for men', 'for him', 'men', 'homme', 'man'], { gender: 'men' });
  add('gender:women', 'gender', 'สำหรับผู้หญิง', ['แฟนสาว', 'ผู้หญิง', 'สาวๆ', 'สาว', 'ภรรยา', 'pour femme', 'for women', 'for her', 'women', 'femme', 'lady'], { gender: 'women' });
  add('gift', 'gift', 'เป็นของขวัญ', ['ของขวัญ', 'กิฟต์', 'gift', 'วันเกิด', 'ปีใหม่', 'เซอร์ไพรส์', 'ให้แม่', 'ให้แฟน', 'ให้เพื่อน', 'ให้พี่', 'ให้น้อง'], {});

  // ---- กลิ่น
  add('attr:sweet', 'attr', 'กลิ่นหวาน', ['หวานๆ', 'หวานละมุน', 'หวาน', 'วานิลลา', 'ขนม', 'คาราเมล', 'sweet', 'vanilla', 'caramel', 'gourmand'], { terms: ['หวาน', 'วานิลลา', 'vanilla', 'ขนม', 'คาราเมล', 'caramel', 'gourmand', 'sweet', 'น้ำตาล', 'เค้ก', 'วิปครีม'] });
  add('attr:fresh', 'attr', 'กลิ่นสดชื่น', ['สดชื่น', 'เฟรช', 'ซิตรัส', 'เลมอน', 'มะนาว', 'ทะเล', 'สะอาดๆ', 'fresh', 'citrus', 'aqua', 'marine', 'aquatic', 'cool'], { terms: ['สดชื่น', 'เฟรช', 'fresh', 'citrus', 'ซิตรัส', 'เลมอน', 'lemon', 'bergamot', 'เบอร์กามอต', 'ทะเล', 'aqua', 'marine', 'aquatic', 'เย็น', 'สะอาด', 'ส้ม'] });
  add('attr:floral', 'attr', 'กลิ่นดอกไม้', ['ดอกไม้', 'กุหลาบ', 'มะลิ', 'ซากุระ', 'พีโอนี', 'floral', 'flower', 'rose', 'jasmine', 'blossom', 'peony', 'orchid'], { terms: ['ดอกไม้', 'floral', 'flower', 'กุหลาบ', 'rose', 'มะลิ', 'jasmine', 'ซากุระ', 'blossom', 'peony', 'พีโอนี', 'orchid', 'ลิลลี่', 'lily', 'ไวโอเล็ต', 'violet', 'ฟรีเซีย', 'freesia', 'gardenia', 'การ์ดีเนีย'] });
  add('attr:woody', 'attr', 'กลิ่นวู้ดดี้', ['วู้ดดี้', 'วูดดี้', 'ไม้จันทน์', 'ไม้หอม', 'กลิ่นไม้', 'woody', 'wood', 'sandalwood', 'cedar', 'oud', 'อู๊ด'], { terms: ['วู้ดดี้', 'woody', 'wood', 'ไม้จันทน์', 'sandalwood', 'cedar', 'ซีดาร์', 'oud', 'อู๊ด', 'ไม้'] });
  add('attr:musk', 'attr', 'กลิ่นมัสค์', ['มัสค์', 'มัสก์', 'musk', 'musc'], { terms: ['musk', 'musc', 'มัสค์', 'มัสก์'] });
  add('attr:fruity', 'attr', 'กลิ่นผลไม้', ['ผลไม้', 'เบอร์รี่', 'พีช', 'แอปเปิ้ล', 'มะพร้าว', 'fruity', 'berry', 'peach', 'apple', 'coconut', 'pear'], { terms: ['ผลไม้', 'fruity', 'เบอร์รี่', 'berry', 'พีช', 'peach', 'แอปเปิ้ล', 'apple', 'ลูกแพร์', 'pear', 'มะพร้าว', 'coconut', 'องุ่น', 'cherry', 'เชอร์รี่', 'มะม่วง', 'ลิ้นจี่'] });
  add('attr:sexy', 'attr', 'กลิ่นเซ็กซี่/ดึงดูด', ['เซ็กซี่', 'เซ็กซี', 'ยั่ว', 'ดึงดูด', 'ลึกลับ', 'ไปเดท', 'เดท', 'sexy', 'seductive', 'amber', 'อำพัน'], { terms: ['เซ็กซี่', 'sexy', 'ยั่ว', 'ดึงดูด', 'ลึกลับ', 'seduct', 'amber', 'อำพัน', 'ค่ำคืน', 'night'] });
  add('attr:clean', 'attr', 'กลิ่นสะอาด/ผู้ดี', ['ไปทำงาน', 'ทำงาน', 'ออฟฟิศ', 'ผู้ดี', 'ใช้ประจำ', 'ทุกวัน', 'สะอาด', 'ละมุน', 'อ่อนๆ', 'เบาๆ', 'office', 'clean'], { terms: ['สะอาด', 'ผู้ดี', 'ละมุน', 'อ่อนโยน', 'เบาๆ', 'clean', 'soft', 'ออฟฟิศ', 'ทำงาน'] });
  add('attr:summer', 'attr', 'เหมาะกับอากาศร้อน', ['อากาศร้อน', 'หน้าร้อน', 'ฤดูร้อน', 'ไปทะเล', 'summer'], { terms: ['สดชื่น', 'เฟรช', 'fresh', 'aqua', 'citrus', 'ซิตรัส', 'อากาศร้อน', 'summer', 'เย็น'] });
  add('attr:long', 'attr', 'ติดทนนาน', ['ติดทนนาน', 'ติดทน', 'ติดนาน', 'ทนนาน', 'long lasting', 'longlasting'], { terms: ['ติดทน', 'ติดนาน', 'ทนนาน', 'long-lasting', 'long lasting', 'ชั่วโมง', 'เข้มข้น', 'intense', 'parfum', 'extrait', 'elixir'] });
  add('attr:intense', 'attr', 'กลิ่นเข้มข้น', ['เข้มข้น', 'กลิ่นแรง', 'intense', 'parfum', 'elixir'], { terms: ['เข้มข้น', 'intense', 'parfum', 'elixir', 'extrait', 'absolu'] });
  add('attr:white', 'attr', 'ผิวกระจ่างใส', ['ผิวขาว', 'ขาวใส', 'หน้าใส', 'กระจ่างใส', 'ผิวใส', 'ไบรท์เทนนิ่ง', 'ด่างดำ', 'หมองคล้ำ', 'ฝ้า', 'กระ', 'brightening', 'whitening', 'brighten', 'spotless', 'ขาว'], { skin: true, terms: ['ขาวใส', 'กระจ่างใส', 'ผิวขาว', 'ผิวใส', 'หน้าใส', 'brighten', 'whiten', 'ด่างดำ', 'หมองคล้ำ', 'ฝ้า', 'spotless', 'tone up', 'โทนอัพ', 'vitamin c', 'วิตามินซี', 'niacinamide'] });
  add('attr:acne', 'attr', 'ลดสิว/คุมมัน', ['สิวอุดตัน', 'สิว', 'รูขุมขน', 'คุมมัน', 'ควบคุมความมัน', 'หน้ามัน', 'acne', 'oil control', 'pore'], { skin: true, terms: ['สิว', 'acne', 'รูขุมขน', 'pore', 'คุมมัน', 'ความมัน', 'oil control', 'หน้ามัน', 'bha', 'salicylic', 'tea tree'] });
  add('attr:aging', 'attr', 'ลดเลือนริ้วรอย', ['ริ้วรอย', 'ต้านแก่', 'ชะลอวัย', 'ยกกระชับ', 'ตีนกา', 'หย่อนคล้อย', 'อายุ', 'anti aging', 'anti-aging', 'wrinkle', 'retinol', 'เรตินอล', 'lifting', 'firming'], { skin: true, terms: ['ริ้วรอย', 'ต้านแก่', 'ชะลอวัย', 'ยกกระชับ', 'ตีนกา', 'anti-aging', 'anti aging', 'wrinkle', 'retinol', 'เรตินอล', 'lifting', 'firming', 'aging', 'ageless', 'regener'] });
  add('attr:moist', 'attr', 'เติมความชุ่มชื้น', ['ชุ่มชื้น', 'ผิวแห้ง', 'แห้งกร้าน', 'ฉ่ำ', 'ฉ่ำวาว', 'moisture', 'hydrating', 'hydra', 'hyaluronic'], { skin: true, terms: ['ชุ่มชื้น', 'moistur', 'hydrat', 'hydra', 'ผิวแห้ง', 'ฉ่ำ', 'hyaluronic', 'ไฮยา'] });
  add('attr:sensitive', 'attr', 'อ่อนโยนผิวแพ้ง่าย', ['ผิวแพ้ง่าย', 'แพ้ง่าย', 'ผิวบอบบาง', 'บอบบาง', 'ผิวบอบบาง', 'อ่อนโยน', 'sensitive'], { skin: true, terms: ['แพ้ง่าย', 'บอบบาง', 'อ่อนโยน', 'sensitive', 'ปลอบประโลม', 'soothing', 'ระคายเคือง'] });
  add('attr:nude', 'attr', 'โทนนู้ด/ชมพูนู้ด', ['ชมพูนู้ด', 'นู้ดๆ', 'นู้ด', 'เบจ', 'nude', 'beige'], { terms: ['นู้ด', 'nude', 'เบจ', 'beige', 'ชมพูนม', 'น้ำตาลอ่อน'] });
  add('attr:red', 'attr', 'โทนแดง', ['สีแดง', 'แดงสด', 'แดง', 'red'], { terms: ['แดง', 'red', 'strawberry', 'cherry'] });
  add('attr:pink', 'attr', 'โทนชมพู', ['สีชมพู', 'ชมพู', 'pink'], { terms: ['ชมพู', 'pink', 'rosy', 'rose'] });
  add('attr:coral', 'attr', 'โทนส้ม/คอรัล', ['ส้มอิฐ', 'คอรัล', 'ส้ม', 'coral', 'orange'], { terms: ['ส้ม', 'coral', 'คอรัล', 'orange', 'peach'] });
  add('attr:matte', 'attr', 'เนื้อแมท', ['ลิปแมท', 'เนื้อแมท', 'แมท', 'แมทต์', 'matte', 'matt'], { terms: ['แมท', 'matte', 'matt', 'velvet', 'เวลเวท'] });
  add('attr:glow', 'attr', 'เนื้อฉ่ำ/โกลว์', ['ฉ่ำๆ', 'โกลว์', 'เงา', 'กลอส', 'glossy', 'gloss', 'glow'], { terms: ['ฉ่ำ', 'โกลว์', 'glow', 'gloss', 'เงา', 'dewy', 'ชิมเมอร์', 'shimmer'] });

  // ---- ยี่ห้อ (ชื่อไทย → ชื่อที่ปรากฏในชื่อสินค้า)
  const BRAND_ALIAS = {
    ดิออร์: 'dior', ดีออร์: 'dior', ชาแนล: 'chanel', ชาเนล: 'chanel', กุชชี่: 'gucci', กุชชี: 'gucci', อาร์มานี่: 'armani', อาร์มานี: 'armani',
    วิคตอเรีย: 'victoria', วิคตอเรียซีเคร็ท: 'victoria', วิคตอเรียซีเครท: 'victoria', ลาเมอร์: 'la mer', ซูลวาซู: 'sulwhasoo', ซูลฮวาซู: 'sulwhasoo',
    ชิเซโด้: 'shiseido', ชิเซโด: 'shiseido', แลนคอม: 'lancome', ลังโคม: 'lancome', เอสเต: 'estee', เอสเตลอเดอร์: 'estee', ทอมฟอร์ด: 'tom ford',
    อีฟแซงต์โลรองต์: 'ysl', วายเอสแอล: 'ysl', เวอร์ซาเช่: 'versace', เวอร์ซาเซ่: 'versace', ปราด้า: 'prada', เบอเบอร์รี่: 'burberry', เบอร์เบอร์รี่: 'burberry',
    นาร์ส: 'nars', แมค: 'mac', มัค: 'mac', คลาแรงส์: 'clarins', ยูเซอริน: 'eucerin', เคราสตาส: 'kerastase', เคอราสตาส: 'kerastase', โอลาเพล็กซ์: 'olaplex',
    เฮร่า: 'hera', เบเนฟิต: 'benefit', ล็อกซิทาน: 'occitane', โลคซิทาน: 'occitane', บูลการี: 'bvlgari', บีวีแอลการี: 'bvlgari', นาร์ซิโซ: 'narciso',
    จิมมี่ชู: 'jimmy choo', เจโลน: 'jo malone', โจมาโลน: 'jo malone', เดวิดอฟ: 'davidoff', ลาโรช: 'roche', ฮูโก้บอส: 'hugo', วีรีค: 'whoo', ฮู: 'whoo',
  };

  const MULTI_BRANDS = ['la mer', 'tom ford', 'estee lauder', 'jo malone', 'jimmy choo', 'la roche posay', 'roche posay', 'miss dior', 'mont blanc', 'bath body', 'victorias secret',
    'victoria secret', 'narciso rodriguez', 'le labo', 'elizabeth arden', 'shu uemura', 'charlotte tilbury', 'rare beauty', 'fenty beauty', 'clarins', 'la vie est belle', 'dolce gabbana'];

  // ---------------------------------------------------------------- shop intents (ตอบคำถามร้าน)
  const SHOP_INTENTS = [
    ['hours', ['เวลาทำการ', 'เปิดกี่โมง', 'ปิดกี่โมง', 'เปิดปิด', 'เปิดร้าน', 'วันหยุด', 'หยุดวัน', 'ร้านเปิด']],
    ['contact', ['ติดต่อ', 'ไลน์', 'line oa', 'เฟสบุ๊ก', 'เฟสบุ๊ค', 'facebook', 'ไอจี', 'instagram', 'เบอร์โทร', 'โทรหา', 'แอดมินตัวจริง', 'คุยกับคน', 'ทักร้าน', 'ช่องทาง']],
    ['order', ['สั่งซื้อ', 'สั่งยังไง', 'วิธีสั่ง', 'ซื้อยังไง', 'สั่งของ', 'วิธีซื้อ', 'order']],
    ['shipping', ['จัดส่ง', 'ส่งของ', 'ส่งกี่วัน', 'ค่าส่ง', 'ส่งฟรี', 'ขนส่ง', 'ส่งต่างประเทศ', 'ส่งไปที่', 'ของถึงเมื่อไหร่']],
    ['human', ['ชำระเงิน', 'จ่ายเงิน', 'โอนเงิน', 'พร้อมเพย์', 'ปลายทาง', 'บัตรเครดิต', 'ผ่อน', 'โปรโมชั่น', 'โปรโมชัน', 'ส่วนลด', 'คูปอง', 'ลดราคา', 'เปลี่ยนคืน', 'คืนสินค้า', 'คืนเงิน', 'รับประกัน', 'เคลม', 'พรีออเดอร์', 'พร้อมส่งไหม', 'สต็อก', 'สต๊อก', 'ของหมด', 'หมดไหม', 'มีของไหม', 'ใบเสร็จ', 'ใบกำกับ']],
    ['authentic', ['ของแท้ไหม', 'ของแท้หรือเปล่า', 'แท้ไหม', 'แท้หรือ', 'ของปลอม', 'ปลอมไหม', 'ออริจินัล', 'authentic', 'ของเทียบ']],
    ['about', ['คุณคือใคร', 'เธอคือใคร', 'ชื่ออะไร', 'เป็นใคร', 'บอทเหรอ', 'เป็นบอท', 'คนจริงไหม', 'หุ่นยนต์']],
  ];
  const GREET = ['สวัสดี', 'หวัดดี', 'ดีจ้า', 'ดีค่ะ', 'ดีครับ', 'ฮัลโหล', 'hello', 'hi', 'hey', 'เฮ้'];
  const THANKS = ['ขอบคุณ', 'ขอบใจ', 'thank', 'thx', 'ขอบคุนค่ะ'];
  const BYE = ['บ๊ายบาย', 'ไว้เจอกัน', 'ลาก่อน', 'bye'];
  const MORE = ['ดูเพิ่ม', 'ขอดูเพิ่ม', 'อีกหน่อย', 'อีกได้ไหม', 'อีกๆ', 'ตัวอื่น', 'อันอื่น', 'แบบอื่น', 'รุ่นอื่น', 'ยี่ห้ออื่น', 'ไม่ชอบ', 'ไม่เอา', 'เปลี่ยน', 'อีก', 'next'];
  const CHEAPER = ['ถูกกว่า', 'ลดงบ', 'ราคาถูกลง', 'ถูกลง', 'ลดราคาลง', 'ไม่แพงกว่า'];
  const PRICIER = ['แพงกว่า', 'ดีกว่านี้', 'พรีเมียมกว่า', 'หรูกว่า', 'เกรดสูงกว่า', 'ตัวท็อป'];
  const ASK_PRICE = ['ราคาเท่าไหร่', 'ราคาเท่าไร', 'กี่บาท', 'เท่าไหร่', 'เท่าไร', 'ราคา'];
  const ASK_HOWTO = ['วิธีใช้', 'ใช้ยังไง', 'ใช้อย่างไร', 'ใช้ตอนไหน', 'วิธีการใช้'];

  // ---------------------------------------------------------------- catalog index
  const IDX = { for: null, df: new Map(), N: 0, byId: new Map() };

  function baseKey(name) {
    return norm(name)
      .replace(/\b\d+(\.\d+)?\s*(ml|g|กรัม|มล|oz|cm|ซม)\b/g, ' ')
      .replace(/no box|tester box|ไม่มีกล่อง|มีกล่อง|แบ่งขาย|ขวดแบ่ง|ขวดแบ่งขาย|กล่องซีล|กล่องเทสต์|กล่องเทสเตอร์|กล่องเทส|เทสเตอร์|tester|vial|ฝาแดง|รุ่นใหม่|ออกใหม่|ล่าสุด|ไซส์ใหญ่|ขนาดพกพา|หลอด|ซอง|ขวด|กล่อง/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function sizeMl(name) {
    const m = String(name).toLowerCase().replace(/(\d)\s+(ml|g)/g, '$1$2').match(/(\d+(?:\.\d+)?)ml/);
    return m ? Number(m[1]) : null;
  }
  const MEN_NAME = /homme|pour lui|\bmen\b|for him|sauvage|explorer|eros\b|aventus|invictus|one million|acqua di gio|\bbleu\b|\blegend\b|\by (edp|le|l)|fahrenheit|spicebomb|terre d|club de nuit|\bmusk\b.*\bman\b|ผู้ชาย/;
  const WOMEN_NAME = /femme|pour elle|women|\bher\b|lady|mademoiselle|\bmiss\b|\bgirl|flora|bloom|\blibre\b|la vie est belle|j'?adore|fantasy|blossom|\bbare\b|rosy/;

  function ensureIndex(products) {
    if (IDX.for === products) return;
    IDX.for = products; IDX.N = products.length; IDX.df = new Map(); IDX.byId = new Map();
    for (const p of products) {
      p._n = norm(p.name);
      p._d = norm((p.description || '').slice(0, 2500));
      p._base = baseKey(p.name);
      p._ml = sizeMl(p.name);
      p._small = (p._ml != null && p._ml <= 15) || /แบ่งขาย|vial|mini|ขวดแบ่ง/.test(p._n);
      p._img = !!(p.image_url);
      p._brand = (p._n.match(/[a-z]{3,}/) || [''])[0];
      p._m = new Map();
      IDX.byId.set(String(p.id), p);
      new Set(p._n.match(/[a-z]{3,}/g) || []).forEach((t) => IDX.df.set(t, (IDX.df.get(t) || 0) + 1));
    }
  }
  const idf = (t) => {
    const df = IDX.df.get(t) || 0;
    return df ? Math.max(1, Math.min(5, 1 + Math.log(IDX.N / df) * 0.9)) : 0;
  };

  // ---------------------------------------------------------------- query parsing
  function parseBudget(q) {
    const s = q.replace(/(\d),(\d{3})/g, '$1$2').replace(/฿/g, ' บาท ');
    let min = null; let max = null; let m;
    let rest = s;
    const eat = (re, fn) => { const mm = rest.match(re); if (mm) { fn(mm); rest = rest.replace(mm[0], ' '); return true; } return false; };
    if (eat(/(\d{2,6})\s*(?:-|ถึง|to)\s*(\d{2,6})\s*(?:บาท)?/, (mm) => { min = Number(mm[1]); max = Number(mm[2]); })) return { min, max, rest };
    if (eat(/(?:ไม่เกิน|ต่ำกว่า|น้อยกว่า|ไม่ถึง|ภายใน|ราคาไม่เกิน|งบไม่เกิน|under)\s*(?:ประมาณ)?\s*(\d{2,6})/, (mm) => { max = Number(mm[1]); })) return { min, max, rest };
    if (eat(/(\d{2,6})\s*(?:บาท)?\s*(?:ลงมา|ลงไป|หรือน้อยกว่า|หรือต่ำกว่า)/, (mm) => { max = Number(mm[1]); })) return { min, max, rest };
    if (eat(/(?:เกิน|มากกว่า|ตั้งแต่|สูงกว่า)\s*(\d{2,6})/, (mm) => { min = Number(mm[1]); })) return { min, max, rest };
    if (eat(/(\d{2,6})\s*(?:บาท)?\s*(?:ขึ้นไป|ขึ้น)/, (mm) => { min = Number(mm[1]); })) return { min, max, rest };
    if (eat(/(?:งบ|งบประมาณ|ราคา)\s*(?:ประมาณ|ราวๆ|ราว)?\s*(\d{2,6})/, (mm) => { max = Number(mm[1]); })) return { min, max, rest };
    if (eat(/(?:ประมาณ|ราวๆ|ราว|around)\s*(\d{2,6})\s*(?:บาท)?/, (mm) => { const v = Number(mm[1]); min = v * 0.6; max = v * 1.25; })) return { min, max, rest };
    if ((m = rest.match(/(\d{2,6})\s*บาท/))) { const v = Number(m[1]); min = v * 0.5; max = v * 1.2; rest = rest.replace(m[0], ' '); }
    return { min, max, rest };
  }

  function findHits(q) {
    // longest-match: ตัดคำที่เจอออกจากประโยค ไม่ให้นับซ้ำ
    const entries = [];
    for (const c of L) for (const t of c.triggers) entries.push([t, c]);
    entries.sort((a, b) => b[0].length - a[0].length);
    let s = ` ${q} `;
    const hits = new Map();
    for (const [t, c] of entries) {
      const nt = norm(t);
      if (!nt) continue;
      let idx = -1;
      // คำอังกฤษต้องเป็นคำเต็มเสมอ (กัน "berry" ไปจับใน "burberry")
      if (isLatin(nt)) { const m = wordRe(nt).exec(s); idx = m ? m.index + m[1].length : -1; } else idx = s.indexOf(nt);
      if (idx !== -1) {
        hits.set(c.id, c);
        s = s.slice(0, idx) + ' '.repeat(nt.length) + s.slice(idx + nt.length);
      }
    }
    return { hits, rest: s };
  }

  function parse(text) {
    const q0 = norm(text.replace(/(\d),(\d{3})/g, '$1$2'));
    const budget = parseBudget(text.toLowerCase().replace(/ๆ/g, ' '));
    const { hits, rest } = findHits(norm(budget.rest));
    const f = { cats: new Set(), types: [], attrs: [], gender: null, size: null, pref: null, gift: false, brands: [], brandLabels: [], words: [], min: budget.min, max: budget.max, raw: q0, ml: null };

    for (const c of hits.values()) {
      if (c.kind === 'cat') f.cats.add(c.value);
      else if (c.kind === 'type') { if (c.size) f.size = c.size; else f.types.push(c); }
      else if (c.kind === 'attr') f.attrs.push(c);
      else if (c.kind === 'gender') f.gender = c.gender;
      else if (c.kind === 'size') f.size = c.size;
      else if (c.kind === 'pref') f.pref = c.pref;
      else if (c.kind === 'gift') f.gift = true;
    }

    // ผู้รับของขวัญ → เพศ  /  "โลชั่นน้ำหอม" = โลชั่นที่เป็นกลิ่นน้ำหอม
    if (/ให้แม่|คุณแม่|ภรรยา|แฟนสาว|ให้เพื่อนผู้หญิง|ให้พี่สาว|ให้น้องสาว/.test(q0) && !f.gender) f.gender = 'women';
    if (/ให้พ่อ|คุณพ่อ|สามี|แฟนหนุ่ม|ให้เพื่อนผู้ชาย|ให้พี่ชาย|ให้น้องชาย/.test(q0) && !f.gender) f.gender = 'men';
    if (q0.includes('โลชั่นน้ำหอม')) f.words.push('น้ำหอม');
    // ยี่ห้อภาษาไทย → อังกฤษ
    let r = rest;
    for (const [th, en] of Object.entries(BRAND_ALIAS)) if (r.includes(th)) { f.brands.push(...en.split(' ')); f.brandLabels.push(en.toUpperCase()); r = r.replace(th, ' '); }
    // ชื่อยี่ห้อหลายคำที่พิมพ์เป็นอังกฤษ
    for (const phrase of MULTI_BRANDS) {
      if (wordRe(phrase).test(` ${r} `) || r.includes(phrase)) {
        f.brands.push(...phrase.split(' ').filter((x) => x.length >= 2)); f.brandLabels.push(phrase.toUpperCase());
        r = r.replace(phrase, ' ');
      }
    }
    // ขนาด เช่น 30ml
    const mlm = r.match(/(\d+(?:\.\d+)?)\s*ml/);
    if (mlm) { f.ml = Number(mlm[1]); r = r.replace(mlm[0], ' '); }
    // คำอังกฤษที่ตรงกับชื่อสินค้าในร้าน (ยี่ห้อ/ชื่อรุ่น)
    const left = [];
    r.split(' ').filter(Boolean).forEach((w) => {
      if (/^[a-z]{3,}$/.test(w) && IDX.df.has(w)) { f.brands.push(w); f.brandLabels.push(w.toUpperCase()); }
      else left.push(w);
    });
    // คำไทยที่เหลือ → ลบวลี stopword ยาว ๆ (เช่น "เท่าไหร่") ก่อน แล้วค่อยตัดคำ
    const longStops = [...STOP].filter((x) => x.length >= 3 && THAI_RE.test(x)).sort((a, b) => b.length - a.length);
    left.forEach((w0) => {
      let w = w0;
      if (THAI_RE.test(w)) longStops.forEach((st) => { if (w.includes(st)) w = w.split(st).join(' '); });
      w.split(' ').filter(Boolean).forEach((chunk) => {
        if (/^\d+$/.test(chunk)) return;
        (THAI_RE.test(chunk) ? segment(chunk) : [chunk]).forEach((tok) => {
          if (tok.length >= 2 && !STOP.has(tok) && !/^\d+$/.test(tok)) f.words.push(tok);
        });
      });
    });
    f.brands = [...new Set(f.brands)];
    f.brandLabels = [...new Set(f.brandLabels)];
    return f;
  }
  const THAI_RE = /[฀-๿]/;

  // ---------------------------------------------------------------- scoring
  function conceptMatch(p, c) {
    if (p._m.has(c.id)) return p._m.get(c.id);
    const terms = c.name || c.terms || [];
    let nameHit = false; let descN = 0;
    for (const t0 of terms) {
      const t = norm(t0);
      if (has(p._n, t)) nameHit = true;
      if (c.kind === 'attr' || c.desc) descN += count(p._d, t);
    }
    const r = { nameHit, descN };
    p._m.set(c.id, r);
    return r;
  }

  function score(p, f, ctx) {
    let s = 0; const why = [];
    // ชนิดสินค้า — ต้องตรงกับ "ชื่อ" เป็นหลัก
    if (f.types.length) {
      let typeOk = false;
      for (const c of f.types) {
        const m = conceptMatch(p, c);
        if (m.nameHit) { s += 12; typeOk = true; why.push(c.label); } else if (c.cat && p.category === c.cat) s += 0.5;
        else s -= 2;
      }
      p._typeOk = typeOk;
    }
    // กลิ่น / สรรพคุณ
    for (const c of f.attrs) {
      const m = conceptMatch(p, c);
      if (m.nameHit) { s += 4; why.push(c.label); }
      if (m.descN) { s += Math.min(5, 1.5 + m.descN * 0.8); if (!m.nameHit) why.push(c.label); }
    }
    // ยี่ห้อ / ชื่อรุ่น (อังกฤษ)
    let bHit = 0;
    for (const b of f.brands) if (has(p._n, b)) { s += 8 * (idf(b) / 3 + 0.4); bHit += 1; }
    ctx.brandHit = bHit;
    // คำไทยที่เหลือ
    for (const w of f.words) {
      if (p._n.includes(w)) s += 5;
      else if (p._d.includes(w)) s += 1.2;
    }
    if (f.ml != null && p._ml === f.ml) s += 6;
    // เพศ (น้ำหอม)
    if (f.gender && (p.category === 'perfume' || !f.cats.size)) {
      const menName = MEN_NAME.test(p._n); const womenName = WOMEN_NAME.test(p._n);
      const menDesc = /น้ำหอมผู้ชาย|สำหรับผู้ชาย|กลิ่นผู้ชาย|ลูกผู้ชาย|for men|pour homme/.test(p._d);
      const womenDesc = /น้ำหอมผู้หญิง|สำหรับผู้หญิง|for women|pour femme/.test(p._d);
      if (f.gender === 'men') { if (menName) s += 8; if (menDesc) s += 4; if (womenName && !menName) s -= 6; if (womenDesc && !menDesc) s -= 4; if (p.category !== 'perfume') s -= 3; }
      else { if (womenName) s += 4; if (womenDesc) s += 3; if (menName && !womenName) s -= 6; if (menDesc && !womenDesc) s -= 4; }
    }
    // ขนาด
    if (f.size === 'small') s += p._small ? 3 : -3;
    if (f.size === 'large') s += (p._ml != null && p._ml >= 50) ? 3 : -3;
    // ของขวัญ → เซ็ต/กล่อง หรือขวดเต็ม ยี่ห้อดัง
    if (f.gift) {
      if (/เซ็ต|\bset\b|\bkit\b|box|กล่อง|gift/.test(p._n)) s += 6;
      if (p._ml != null && p._ml >= 50 && !p._small) s += 3;
      if (p._small) s -= 1;
    }
    // กล่องเทสต์/เทสเตอร์ ไม่เหมาะเป็นของฝาก/ตัวเลือกแรก ๆ
    if (/เทส|tester/.test(p._n)) s -= f.gift ? 6 : 1.5;
    // ความชอบด้านราคา
    const lp = Math.log10(Math.max(10, Number(p.price) || 10));
    if (f.pref === 'cheap') s += (3 - lp) * 2.2;
    if (f.pref === 'premium') s += (lp - 2) * 2.2;
    if (p._img) s += 0.3;
    return { s, why };
  }

  // ---------------------------------------------------------------- ranking
  function groupAndPick(scored, f, session, n, offset) {
    // รวมสินค้าเดียวกันหลายขนาด → 1 กลุ่ม
    const groups = new Map();
    for (const it of scored) {
      const key = it.p._base || it.p._n;
      const g = groups.get(key);
      if (!g) groups.set(key, { key, items: [it], best: it.s });
      else { g.items.push(it); g.best = Math.max(g.best, it.s); }
    }
    let list = [...groups.values()];
    const shown = session.shown;
    list.forEach((g) => { g.rank = g.best + (g.items.some((x) => shown.has(String(x.p.id))) ? -8 : 0); });
    list.sort((a, b) => b.rank - a.rank);
    // กระจายยี่ห้อ ไม่ให้ยี่ห้อเดียวซ้ำเกิน 2 ตัวต่อหน้า (ถ้าไม่ได้ระบุยี่ห้อ)
    const capPerBrand = f.brands.length ? 4 : 2;
    const out = []; const brandCount = new Map();
    for (const g of list) {
      const b = g.items[0].p._brand || g.key;
      if ((brandCount.get(b) || 0) >= capPerBrand) continue;
      brandCount.set(b, (brandCount.get(b) || 0) + 1);
      out.push(g);
    }
    return { all: out, page: out.slice(offset, offset + n) };
  }

  function representative(g, f) {
    const items = g.items.slice().sort((a, b) => b.s - a.s);
    if (f.pref === 'cheap' || f.size === 'small') return items.slice().sort((a, b) => a.p.price - b.p.price)[0];
    if (f.min != null || f.max != null) return items[0];
    // ปกติ: ชอบขนาดกลาง ๆ 30-100ml ถ้ามี ไม่งั้นตัวคะแนนสูงสุด
    const mid = items.find((x) => x.p._ml != null && x.p._ml >= 30 && x.p._ml <= 100);
    return mid || items[0];
  }

  function snippetFor(p, f) {
    const d = (p.description || '').replace(/\s+/g, ' ');
    const terms = [];
    f.attrs.forEach((c) => (c.terms || []).forEach((t) => terms.push(t)));
    f.words.forEach((w) => terms.push(w));
    for (const t of terms) {
      const i = d.toLowerCase().indexOf(t.toLowerCase());
      if (i !== -1) {
        const start = Math.max(0, d.lastIndexOf(' ', Math.max(0, i - 25)));
        let sn = d.slice(start, start + 90).replace(/[\u{1F000}-\u{1FFFF}☀-➿]/gu, '').trim();
        if (sn.length > 20) return `“…${sn}…”`;
      }
    }
    return '';
  }

  function runSearch(f, session, opts = {}) {
    const products = IDX.for;
    // กลุ่มสินค้าที่จะค้น: ถ้าระบุหมวด → หมวดนั้น, ไม่ระบุ → เฉพาะความงาม (กันถุง/กระเป๋าโผล่)
    let cats = f.cats.size ? [...f.cats] : null;
    // ชนิดสินค้ากับหมวดขัดกัน (เช่น "คลีนซิ่งล้างเครื่องสำอาง") → เชื่อชนิดสินค้า
    const typeCatsAll = f.types.map((t) => t.cat).filter(Boolean);
    if (cats && typeCatsAll.length && !typeCatsAll.some((c) => cats.includes(c))) { cats = [...new Set(typeCatsAll)]; f.cats = new Set(); }
    if (!cats) {
      const typeCats = f.types.map((t) => t.cat).filter(Boolean);
      cats = typeCats.length === f.types.length && typeCats.length ? [...new Set(typeCats)] : BEAUTY.slice();
      if (!f.types.length && f.attrs.length && f.attrs.every((a) => a.skin)) cats = ['skincare'];
      if (f.gender === 'men' || f.attrs.some((a) => ['attr:sweet', 'attr:fresh', 'attr:floral', 'attr:woody', 'attr:musk', 'attr:fruity', 'attr:sexy', 'attr:clean', 'attr:summer', 'attr:long', 'attr:intense'].includes(a.id)) && !f.types.length) cats = ['perfume'];
    }
    const run = (catList, relaxBudget) => {
      let pool = products.filter((p) => catList.includes(p.category));
      if (!relaxBudget) {
        if (f.max != null) pool = pool.filter((p) => Number(p.price) <= f.max);
        if (f.min != null) pool = pool.filter((p) => Number(p.price) >= f.min);
      }
      const scored = pool.map((p) => { const ctx = {}; const r = score(p, f, ctx); return { p, s: r.s, why: r.why, ctx }; });
      return scored;
    };

    let scored = run(cats, false);
    // เงื่อนไขชนิดสินค้า: ถ้ามีสินค้าที่ชื่อตรง ≥ 2 ชิ้น ให้เหลือเฉพาะที่ชื่อตรง
    if (f.types.length) {
      const typed = scored.filter((x) => x.p._typeOk);
      if (typed.length >= 2) scored = typed;
    }
    // ยี่ห้อ/ชื่อรุ่นที่ระบุ: ถ้ามีสินค้าตรง ให้เหลือเฉพาะที่ตรง (และถ้าระบุหลายคำ ให้ตรงมากสุดก่อน)
    const specific = f.brands.length > 0;
    if (specific) {
      const maxHit = Math.max(0, ...scored.map((x) => x.ctx.brandHit || 0));
      if (maxHit > 0) scored = scored.filter((x) => (x.ctx.brandHit || 0) >= Math.max(1, Math.min(maxHit, f.brands.length >= 2 ? 2 : 1)));
    }
    const hasConstraint = f.types.length || f.attrs.length || f.words.length || specific || f.gender || f.gift || f.size || f.pref || f.ml != null;
    // เงื่อนไขกลุ่ม attr ทั้งหมดเป็น "ยิ่งตรงยิ่งดี" แต่ต้องมีอย่างน้อย 1 อย่างที่ตรง
    const matched = hasConstraint ? scored.filter((x) => x.s > 1.0) : scored;
    // สุ่มเล็กน้อยเพื่อไม่ให้ซ้ำเดิม
    const jitter = hasConstraint ? 1.2 : 6;
    matched.forEach((x) => { x.s += Math.random() * jitter; });
    matched.sort((a, b) => b.s - a.s);
    return { matched, cats, scoredAll: scored, hasConstraint };
  }

  // ---------------------------------------------------------------- reply composing
  function describeFilters(f) {
    const parts = [];
    if (f.gender) parts.push(f.gender === 'men' ? 'สำหรับผู้ชาย' : 'สำหรับผู้หญิง');
    f.types.forEach((c) => parts.push(c.label));
    f.attrs.slice(0, 3).forEach((c) => parts.push(c.label));
    if (f.size === 'small') parts.push('ขวดเล็ก/แบ่งขาย');
    if (f.size === 'large') parts.push('ขวดใหญ่');
    if (f.gift) parts.push('เป็นของขวัญ');
    if (f.pref === 'cheap') parts.push('ราคาประหยัด');
    if (f.pref === 'premium') parts.push('พรีเมียม');
    const brand = f.brandLabels.join(' ');
    if (brand) parts.unshift(brand);
    return parts;
  }
  function budgetText(f) {
    if (f.min != null && f.max != null) return `งบ ${money(f.min)}–${money(f.max)}`;
    if (f.max != null) return `งบไม่เกิน ${money(f.max)}`;
    if (f.min != null) return `ตั้งแต่ ${money(f.min)} ขึ้นไป`;
    return '';
  }
  function catPhrase(cats, f) {
    if (f.cats.size) return [...f.cats].map((c) => CAT_LABEL[c]).join('/');
    return '';
  }

  function chipsFor(f, hasMore, cats) {
    const chips = [];
    if (hasMore) chips.push('ดูตัวอื่นอีก');
    chips.push('ราคาถูกกว่านี้');
    const only = cats.length === 1 ? cats[0] : null;
    if (only === 'perfume') {
      const ids = new Set(f.attrs.map((a) => a.id));
      if (!ids.has('attr:sweet')) chips.push('กลิ่นหวานๆ');
      else if (!ids.has('attr:fresh')) chips.push('กลิ่นสดชื่น');
      if (!f.gender) chips.push('สำหรับผู้ชาย');
    } else if (only === 'skincare' && !f.attrs.length) chips.push('ลดสิว', 'ผิวกระจ่างใส');
    else if (only === 'cosmetics' && !f.types.length) chips.push('ลิปสีนู้ด', 'รองพื้น');
    return chips.slice(0, 4);
  }

  function moreLink(f, cats) {
    const cat = f.cats.size === 1 ? [...f.cats][0] : (cats.length === 1 ? cats[0] : '');
    const words = [...f.brandLabels.map((b) => b.toLowerCase()), ...f.words.filter((w) => w.length >= 3)].slice(0, 3).join(' ');
    const qs = [];
    if (cat) qs.push(`cat=${cat}`);
    if (words) qs.push(`q=${encodeURIComponent(words)}`);
    return `products.html${qs.length ? `?${qs.join('&')}` : ''}`;
  }

  function present(page, f, session) {
    return page.map((g) => {
      const rep = representative(g, f);
      const p = rep.p;
      session.shown.add(String(p.id));
      g.items.forEach((x) => session.shown.add(String(x.p.id)));
      const prices = g.items.map((x) => Number(x.p.price)).sort((a, b) => a - b);
      let note = snippetFor(p, f);
      if (g.items.length > 1) {
        const sizes = [...new Set(g.items.map((x) => x.p._ml).filter(Boolean))].sort((a, b) => a - b);
        const sz = sizes.length > 1 ? `มี ${sizes.length} ขนาด (${sizes.map((v) => `${v}ml`).join(' / ')})` : `มี ${g.items.length} แบบ`;
        note = `${sz} ราคา ${money(prices[0])}–${money(prices[prices.length - 1])}${note ? ` · ${note}` : ''}`;
      }
      return { id: p.id, name: p.name, price: p.price, image_url: p.image_url, category: p.category, note };
    });
  }

  // ---------------------------------------------------------------- main
  function newSession() { return { shown: new Set(), last: null, lastFilters: null }; }

  function anyIn(text, list) { return list.some((t) => has(text, norm(t))); }

  function respond(rawText, products, session) {
    session = session || newSession();
    ensureIndex(products || []);
    const text = String(rawText || '').trim();
    const t = norm(text);
    if (!t) return { text: 'พิมพ์มาได้เลยจ้า หนูรออยู่น้า 🥰', suggestions: ['แนะนำน้ำหอม', 'แนะนำสกินแคร์', 'งบ 500 บาท'] };

    const f = parse(text);
    const productSignal = f.cats.size || f.types.length || f.attrs.length || f.gender || f.gift || f.size || f.brands.length || f.words.length || f.ml != null || f.min != null || f.max != null;

    // ---- ร้าน/บริการ (เฉพาะเมื่อไม่ได้พูดถึงสินค้า หรือพูดชัดเจน)
    for (const [key, words] of SHOP_INTENTS) {
      if (anyIn(t, words)) {
        const strong = key !== 'contact' || !f.types.length;
        if (strong && (!f.cats.size && !f.types.length && !f.attrs.length || ['hours', 'order', 'shipping', 'human', 'authentic', 'about'].includes(key))) {
          return { text: SHOP[key], suggestions: key === 'order' ? ['แนะนำน้ำหอม', 'ติดต่อร้าน'] : ['แนะนำน้ำหอม', 'แนะนำสกินแคร์'] };
        }
      }
    }

    // ---- ทักทาย / ขอบคุณ / ลา (เมื่อไม่มีเรื่องสินค้าปน)
    const shortMsg = t.length <= 24;
    if (shortMsg && !productSignal) {
      if (anyIn(t, THANKS)) return { text: pick(['ยินดีมากเลยจ้า 🥰 มีอะไรให้ช่วยอีกไหมคะ', 'ด้วยความยินดีค่ะ 💖 อยากดูอะไรเพิ่มบอกได้เลยน้า']), suggestions: ['แนะนำน้ำหอม', 'แนะนำสกินแคร์'] };
      if (anyIn(t, BYE)) return { text: 'บ๊ายบายจ้า 💕 ไว้แวะมาคุยกันใหม่น้า' };
      if (GREET.some((g) => t === g || t.startsWith(`${g} `) || (THAI_RE.test(g) && t.includes(g)))) {
        return { text: pick([`หวัดดีจ้า~ 💕 วันนี้อยากได้อะไรเป็นพิเศษไหมคะ`, `ดีจ้าา ✨ ${BOT_NAME}พร้อมช่วยเลือกของให้แล้วน้า`]) + '\nบอกได้เลยว่าชอบกลิ่นแบบไหน ผิวเป็นยังไง หรืองบเท่าไหร่ เดี๋ยวหาให้ค่ะ', suggestions: ['น้ำหอมกลิ่นหวานๆ', 'สกินแคร์ลดสิว', 'ลิปสีนู้ด', 'งบ 500 บาท'] };
      }
    }

    // ---- ต่อบทสนทนา: "อีก / ตัวอื่น / ถูกกว่านี้ / แพงกว่า"
    const last = session.last;
    const isMore = last && !f.types.length && !f.cats.size && !f.attrs.length && !f.brands.length && !f.gender && anyIn(t, MORE);
    const isCheaper = last && anyIn(t, CHEAPER);
    const isPricier = last && anyIn(t, PRICIER);
    if (isMore && !isCheaper && !isPricier) {
      const next = last.all.slice(last.offset, last.offset + PAGE);
      if (!next.length) {
        return { text: `ตัวที่ตรงกับที่ถามหนูเอามาให้ดูครบแล้วค่ะ 🥺 ลองบอกเงื่อนไขใหม่ เช่น กลิ่นที่ชอบ หรืองบประมาณ เดี๋ยวหาให้ใหม่น้า`, suggestions: ['กลิ่นสดชื่น', 'ราคาถูกกว่านี้', 'ติดต่อร้าน'] };
      }
      last.offset += PAGE;
      const cards = present(next, last.f, session);
      return { text: pick(['ได้เลยจ้า มาอีกชุดนะคะ 💖', 'งั้นลองตัวนี้ดูน้า ✨', 'อันนี้ก็น่าสนใจมากค่ะ 🥰']), products: cards, suggestions: chipsFor(last.f, last.offset < last.all.length, last.cats), moreLink: moreLink(last.f, last.cats) };
    }

    // ---- สืบทอดบริบทจากข้อความก่อนหน้า (เช่น "แนะนำน้ำหอม" → "กลิ่นหวานๆ")
    let inherited = false;
    const prev = session.lastFilters;
    if (prev && !f.cats.size && !f.types.length && !f.brands.length && !f.gift && !(f.words.length > 1) && (isCheaper || isPricier || f.attrs.length || f.gender || f.size || f.pref || f.min != null || f.max != null)) {
      if (prev.cats.size) prev.cats.forEach((c) => f.cats.add(c));
      if (prev.types.length) f.types = prev.types.slice();
      if (!f.attrs.length) f.attrs = prev.attrs.slice();
      if (!f.gender && prev.gender) f.gender = prev.gender;
      if (!f.brands.length && prev.brands.length) f.brands = prev.brands.slice();
      inherited = true;
    }
    if (isCheaper && last) {
      const lowest = Math.min(...last.prices);
      f.max = (f.max != null ? f.max : (last.f.max != null ? Math.min(last.f.max, lowest) : lowest)) * 0.98;
      if (prev && prev.min != null) f.min = null;
    }
    if (isPricier && last) {
      f.min = Math.max(...last.prices) * 1.02;
      f.max = null;
    }

    // ---- ถามเรื่องสินค้าเฉพาะ: ราคา / วิธีใช้
    const askPrice = anyIn(t, ASK_PRICE);
    const askHow = anyIn(t, ASK_HOWTO);

    // ---- ไม่มีเงื่อนไขอะไรเลยและไม่มีบริบท → ถามกลับ
    const hasAny = f.cats.size || f.types.length || f.attrs.length || f.gender || f.gift || f.size || f.brands.length || f.words.length || f.ml != null || f.min != null || f.max != null || f.pref;
    if (!hasAny) {
      return { text: `หนูยังจับใจความไม่ค่อยได้เลยค่ะ 🥺 ลองบอกเป็นแบบนี้ได้น้า\n• "น้ำหอมกลิ่นหวานๆ ไม่เกิน 500 บาท"\n• "สกินแคร์ลดสิว" / "ลิปสีนู้ด"\n• หรือพิมพ์ชื่อยี่ห้อ/รุ่น เช่น "Dior" "La Mer"`, suggestions: ['แนะนำน้ำหอม', 'แนะนำสกินแคร์', 'ติดต่อร้าน'] };
    }

    // ---- ค้นหา
    let { matched, cats, hasConstraint } = runSearch(f, session);
    let relaxedNote = '';
    if (matched.length < 2 && (f.min != null || f.max != null)) {
      // ไม่มีในงบ → ผ่อนงบ แต่บอกลูกค้าตรง ๆ
      const f2 = { ...f, min: null, max: null };
      const r2 = runSearch(f2, session);
      if (r2.matched.length) {
        // เลือกตัวที่ใกล้งบที่สุด
        const target = f.max != null ? f.max : f.min;
        r2.matched.sort((a, b) => Math.abs(a.p.price - target) - Math.abs(b.p.price - target) || b.s - a.s);
        matched = r2.matched.slice(0, 12);
        relaxedNote = `${budgetText(f)} ยังไม่มีที่ตรงเป๊ะเลยค่ะ 🥺 แต่ที่ใกล้เคียงที่สุดคือแบบนี้น้า`;
      }
    }
    if (matched.length < 1 && f.cats.size && hasConstraint) {
      // เงื่อนไขเข้มเกินไป → ผ่อน: ดูทั้งหมวด
      const f3 = { ...f, types: [], attrs: [], words: [], brands: [], gender: null, size: null, gift: false };
      const r3 = runSearch(f3, session);
      matched = r3.matched; hasConstraint = false;
      relaxedNote = 'ตรงเป๊ะยังไม่เจอเลยค่ะ 🥺 ลองดูตัวเด่น ๆ ในหมวดนี้ก่อนนะคะ';
    }
    if (matched.length < 1 && !f.cats.size) {
      // ลองค้นทุกหมวด (กระเป๋า/อาหาร/อาหารเสริม ฯลฯ)
      const f4 = { ...f, cats: new Set(['perfume', 'skincare', 'cosmetics', 'supplements', 'food', 'bags', 'pouches', 'general']) };
      const r4 = runSearch(f4, session);
      matched = r4.matched; cats = r4.cats;
    }

    if (!matched.length) {
      return { text: `หาที่ตรงกับ “${text.slice(0, 40)}” ยังไม่เจอเลยค่ะ 🥺 ลองเปลี่ยนคำ หรือบอกกลิ่น/ชนิดสินค้า/งบประมาณเพิ่มอีกนิดน้า หรือทักแอดมินตัวจริงทาง LINE @cosmeoutlet ให้ช่วยหาให้ก็ได้ค่ะ 💕`, suggestions: ['แนะนำน้ำหอม', 'แนะนำสกินแคร์', 'ติดต่อร้าน'] };
    }

    const { all, page } = groupAndPick(matched, f, session, PAGE, 0);
    const cards = present(page, f, session);
    const prices = page.map((g) => representative(g, f).p.price);

    session.last = { all, offset: page.length, f, cats, prices };
    session.lastFilters = f;

    // ---- ถามราคา / วิธีใช้ ของสินค้าเจาะจง
    const specificAsk = f.brands.length >= 1 && (askHow || askPrice);
    if (specificAsk && askHow) {
      for (const g of all.slice(0, 20)) {
        const rp = representative(g, f).p;
        const m = (rp.description || '').match(/วิธีใช้\s*[:：]?\s*([^\n]{8,260})/);
        if (m) {
          const c = present([g], f, session)[0];
          return { text: `${rp.name.slice(0, 80)}\nวิธีใช้: ${m[1].trim()} 💕`, products: [c], suggestions: ['ดูตัวอื่นอีก', 'ราคาถูกกว่านี้'], moreLink: moreLink(f, cats) };
        }
      }
      return { text: 'ตัวที่ถามยังไม่มีวิธีใช้ละเอียดในระบบเลยค่ะ 🥺 ดูรายละเอียดเต็มในหน้าสินค้าด้านล่างได้น้า หรือถามแอดมินตัวจริงทาง LINE @cosmeoutlet ก็ได้ค่ะ', products: cards.slice(0, 2), suggestions: ['ดูตัวอื่นอีก'], moreLink: moreLink(f, cats) };
    }
    if (specificAsk && askPrice && cards.length) {
      const allPrices = page.flatMap((g) => g.items.map((x) => Number(x.p.price))).sort((a, b) => a - b);
      const lo = allPrices[0]; const hi = allPrices[allPrices.length - 1];
      const priceStr = lo === hi ? money(lo) : `ตั้งแต่ ${money(lo)} ถึง ${money(hi)} (แล้วแต่รุ่น/ขนาด)`;
      const label = f.brandLabels.join(' ') || 'ตัวที่ถาม';
      return { text: `${label} ราคา${priceStr} ค่ะ 💖 ดูทีละรุ่นด้านล่างได้เลยน้า`, products: cards, suggestions: chipsFor(f, all.length > PAGE, cats), moreLink: moreLink(f, cats) };
    }

    // ---- ประกอบข้อความตอบ
    const desc = describeFilters(f);
    const bt = budgetText(f);
    const cp = catPhrase(cats, f);
    const what = [cp, ...desc].filter(Boolean).join(' · ');
    let head;
    if (relaxedNote) head = relaxedNote;
    else if (!hasConstraint) {
      const only = cats.length === 1 ? cats[0] : null;
      const label = (only && CAT_LABEL[only]) || 'สินค้า';
      const ask = only === 'perfume' ? '\nบอกหนูได้นะคะว่าชอบกลิ่นแบบไหน (หวาน/สดชื่น/ดอกไม้/วู้ดดี้) ใช้กับใคร หรืองบเท่าไหร่ จะเลือกให้ตรงใจขึ้นอีกค่ะ'
        : only === 'skincare' ? '\nบอกหนูได้นะคะว่าผิวเป็นแบบไหน (สิว/หน้าหมอง/ผิวแห้ง/ริ้วรอย) หรืองบเท่าไหร่ จะเลือกให้ตรงใจขึ้นค่ะ'
          : only === 'cosmetics' ? '\nบอกหนูได้นะคะว่าอยากได้ชนิดไหน (ลิป/รองพื้น/บลัช/อายแชโดว์) สีโทนไหน หรืองบเท่าไหร่ค่ะ'
            : '\nบอกหนูได้นะคะว่าอยากได้อะไรเป็นพิเศษ หรืองบเท่าไหร่ จะเลือกให้ตรงใจขึ้นค่ะ';
      head = (bt ? `${label} ${bt} มีแบบนี้เลยจ้า 💖` : pick([`${label}มีเยอะมากเลยค่ะ ขอสุ่มตัวน่าสนใจมาให้ก่อนนะคะ 💖`, `มาแล้วจ้า ตัวเด่น ๆ ใน${label} 🥰`])) + ask;
    } else {
      const tpl = [
        `เจอ ${what}${bt ? ` ${bt}` : ''} มาให้แล้วจ้า 💖`,
        `${what}${bt ? ` ${bt}` : ''} ต้องตัวนี้เลยค่ะ ✨`,
        `ตามนี้เลยน้า ${what}${bt ? ` ${bt}` : ''} 🥰`,
      ];
      head = pick(tpl);
      if (inherited) head = `${pick(['โอเคค่ะ ต่อจากเมื่อกี้น้า', 'ได้เลยจ้า', 'จัดให้ค่ะ'])} — ${head}`;
    }
    if (page.length < PAGE && !relaxedNote && all.length <= page.length) head += `\n(ตรงกับที่ถามตอนนี้มี ${all.length} รายการค่ะ)`;
    if (f.gift && !f.attrs.length && f.max == null && f.min == null) head += '\nบอกหนูได้นะคะว่าผู้รับชอบกลิ่น/สไตล์แบบไหน หรืองบเท่าไหร่ จะเลือกให้ตรงใจขึ้นอีกค่ะ 🎁';

    return { text: head, products: cards, suggestions: chipsFor(f, all.length > PAGE, cats), moreLink: moreLink(f, cats) };
  }

  return { respond, newSession, parse, ensureIndex, BOT_NAME, CAT_LABEL };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CosmeBotEngine;
