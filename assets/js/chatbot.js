// ===== Cosme Outlet — "แอดมินคอสเม่" chatbot engine =====
// บอทค้นหาสินค้า/ตอบคำถามทั่วไปของร้าน จับคำสำคัญ (keyword) แล้วตอบด้วยข้อมูลจริงจาก Supabase
// ไม่ได้เชื่อมกับ AI ภายนอกใด ๆ — ทำงานฝั่ง client ล้วน ๆ ไม่มีค่าใช้จ่ายเพิ่ม
//
// ไฟล์นี้ใช้ร่วมกัน 2 หน้าตา:
// 1) หน้าแรก (index.html) — แชทแบบเต็มหน้า ("chat-hero-*" elements)
// 2) หน้าอื่น ๆ — แชทแบบไอคอนลอยมุมขวาล่าง ("chatbot-*" elements)
// initChatbot() ตรวจสอบเองว่าหน้านั้นมี element ไหนอยู่ แล้วเปิดใช้งานโหมดที่ตรงกัน

const BOT_NAME = 'แอดมินคอสเม่';

const CAT_LABEL_BOT = {
  perfume: 'น้ำหอม',
  skincare: 'สกินแคร์',
  cosmetics: 'เครื่องสำอางค์',
  bags: 'กระเป๋า',
  pouches: 'ถุง',
  food: 'อาหาร',
  supplements: 'อาหารเสริม',
  general: 'ทั่วไป',
};
// ลำดับสำคัญ: ต้องเช็ค "อาหารเสริม" ก่อน "อาหาร" เพราะ "อาหารเสริม" มีคำว่า "อาหาร" ปนอยู่
const CAT_KEYWORDS = {
  perfume: ['น้ำหอม', 'โลชั่นน้ำหอม', 'perfume'],
  skincare: ['สกินแคร์', 'บำรุงผิว', 'บำรุงหน้า', 'skincare', 'เซรั่ม', 'มาสก์'],
  cosmetics: ['เครื่องสำอาง', 'แต่งหน้า', 'ลิป', 'ลิปสติก', 'ไฮไลต์', 'cosmetics', 'makeup'],
  bags: ['กระเป๋า', 'bag'],
  pouches: ['ถุง'],
  supplements: ['อาหารเสริม', 'วิตามิน', 'คอลลาเจน', 'supplement'],
  food: ['อาหาร', 'ขนม', 'ราเมน'],
  general: ['ทั่วไป'],
};

const SHOP_INFO = {
  hours: 'ร้านเปิดทุกวันเลยจ้า~ 🕐\nจันทร์-ศุกร์ 09:00-21:00 น.\nเสาร์-อาทิตย์ 10:00-21:00 น.\nทักแชทได้ตลอดเวลาเลยนะ ปกติตอบไวมากค่ะ ภายใน 30 นาที 💕',
  contact: 'ทักหาร้านได้หลายช่องทางเลยจ้า 🥰\n📘 Facebook: facebook.com/cosmeoutlet\n💬 LINE OA: @cosmeoutlet\n📸 Instagram: instagram.com/cosmeoutlet\n\nดูรายละเอียดครบ ๆ ได้ที่หน้า "ติดต่อร้าน" เลยน้า ✨',
  howToOrder: 'สั่งซื้อง่ายมากค่ะ 3 ขั้นตอนเอง 🛍️\n1️⃣ เลือกสินค้าที่ชอบจากหน้า "สินค้าของเรา"\n2️⃣ ทักแชทมาทาง Facebook หรือ LINE OA\n3️⃣ แจ้งที่อยู่ + ชำระเงิน รอรับของได้เลยจ้า 💖',
  shipping: 'แพ็กดีมากกก จัดส่งทั่วประเทศไทยเลยค่ะ 📦✨ พอโอนเงินแล้วแจ้งสลิป ทางร้านจะรีบแพ็กส่งให้ไวที่สุดเลยน้า',
};

let botProducts = null;
let botProductsPromise = null;

function ensureProducts() {
  if (botProductsPromise) return botProductsPromise;
  botProductsPromise = (typeof CosmeDB !== 'undefined' ? CosmeDB.listProducts() : Promise.resolve([]))
    .then((list) => { botProducts = list; return list; })
    .catch(() => { botProducts = []; return []; });
  return botProductsPromise;
}

function formatBotPrice(price) {
  const n = Number(price) || 0;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function includesAny(text, keywords) {
  return keywords.some((k) => text.includes(k.toLowerCase()));
}

function extractBudget(text) {
  const match = text.match(/(\d[\d,]*)\s*บาท/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}

function searchProducts(text, list) {
  const words = text
    .replace(/[?？!！.,()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (!words.length) return [];

  const scored = list.map((p) => {
    const hay = `${p.name} ${p.description || ''}`.toLowerCase();
    let score = 0;
    words.forEach((w) => { if (hay.includes(w.toLowerCase())) score += 1; });
    return { p, score };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((x) => x.p);
}

async function getBotReply(rawText) {
  const text = rawText.trim().toLowerCase();
  await ensureProducts();
  const list = botProducts || [];

  if (!text) {
    return { text: 'พิมพ์อะไรมาได้เลยจ้า หนูรออยู่น้า 🥰' };
  }

  // greeting
  if (includesAny(text, ['สวัสดี', 'หวัดดี', 'ดีจ้า', 'ดีค่ะ', 'ดีครับ', 'hello', 'hi ', 'ฮัลโหล'])) {
    return { text: `หวัดดีจ้า~ 💕 มีอะไรให้${BOT_NAME}ช่วยดูไหมคะ ถามชื่อสินค้า หมวดหมู่ (น้ำหอม/สกินแคร์/เครื่องสำอางค์) หรืองบประมาณที่มีก็ได้เลยน้า ✨` };
  }

  // thanks
  if (includesAny(text, ['ขอบคุณ', 'ขอบใจ', 'thank', 'thx'])) {
    return { text: 'ยินดีมากเลยจ้า 🥰 มีอะไรให้ช่วยอีกไหมคะ ถามมาได้เรื่อย ๆ เลยน้า 💖' };
  }

  // shop hours
  if (includesAny(text, ['เวลาทำการ', 'เปิดกี่โมง', 'ปิดกี่โมง', 'เปิดปิด', 'เปิดร้าน'])) {
    return { text: SHOP_INFO.hours };
  }

  // contact channels
  if (includesAny(text, ['ติดต่อ', 'ไลน์', 'line', 'เฟส', 'facebook', 'ไอจี', 'instagram', 'ig '])) {
    return { text: SHOP_INFO.contact };
  }

  // how to order
  if (includesAny(text, ['สั่งซื้อ', 'สั่งยังไง', 'วิธีสั่ง', 'จะซื้อยังไง', 'ซื้อยังไง'])) {
    return { text: SHOP_INFO.howToOrder };
  }

  // shipping
  if (includesAny(text, ['จัดส่ง', 'ส่งของ', 'ส่งกี่วัน', 'ค่าส่ง', 'ส่งไว'])) {
    return { text: SHOP_INFO.shipping };
  }

  // budget-based search: "ไม่เกิน 300 บาท" / "งบ 200 บาท"
  const budget = extractBudget(text);
  if (budget) {
    const affordable = list
      .filter((p) => Number(p.price) <= budget)
      .sort((a, b) => Number(b.price) - Number(a.price))
      .slice(0, 4);
    if (affordable.length) {
      return {
        text: `งบ ${formatBotPrice(budget)} เนี่ยนะ มีตัวเลือกน่ารัก ๆ แบบนี้เลยจ้า 💸✨`,
        products: affordable,
      };
    }
    return { text: `หาในงบ ${formatBotPrice(budget)} ยังไม่เจอที่ตรงเป๊ะ ๆ เลยอ่ะ ลองทักแชทถามร้านโดยตรงดูนะคะ เผื่อมีโปรพิเศษ 💕` };
  }

  // category browse
  for (const [cat, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (includesAny(text, keywords)) {
      const items = list.filter((p) => p.category === cat).slice(0, 4);
      if (items.length) {
        return {
          text: `หมวด${CAT_LABEL_BOT[cat]}เหรอคะ มีเยอะเลยจ้า ขอแนะนำตัวเด็ด ๆ ก่อนนะคะ 💖`,
          products: items,
        };
      }
    }
  }

  // cheapest / most expensive
  if (includesAny(text, ['ถูกที่สุด', 'ราคาถูก', 'ถูกๆ', 'ราคาย่อมเยา'])) {
    const cheapest = [...list].sort((a, b) => Number(a.price) - Number(b.price)).slice(0, 4);
    return { text: 'อันนี้ราคาน่ารัก คุ้มสุด ๆ เลยจ้า 🥰', products: cheapest };
  }

  // free-text product search
  const found = searchProducts(text, list);
  if (found.length) {
    return {
      text: found.length === 1
        ? 'เจอแล้วจ้า! อันนี้เลยค่ะ ✨'
        : 'เจอหลายตัวเลย ลองดูอันนี้ก่อนนะคะ 💖',
      products: found,
    };
  }

  return {
    text: `อันนี้${BOT_NAME}ไม่ค่อยแน่ใจอ่ะ 🥺 ลองพิมพ์ชื่อสินค้า หรือหมวดหมู่ (น้ำหอม/สกินแคร์/เครื่องสำอางค์) ดูนะคะ หรือจะทักแชทถามร้านโดยตรงทาง Facebook/LINE OA ก็ได้เลยจ้า 💕`,
  };
}

function productCardBotHTML(p) {
  const img = p.image_url || 'assets/images/logo.jpg';
  return `
    <a class="chatbot-product-card" href="product-detail.html?id=${p.id}">
      <img src="${img}" alt="${p.name}" onerror="this.src='assets/images/logo.jpg'">
      <div style="flex:1;">
        <div class="cpc-name">${p.name}</div>
      </div>
      <div class="cpc-price">${formatBotPrice(p.price)}</div>
    </a>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- Reusable chat-thread controller ---------------- */
// wrap ให้ทั้งโหมดป๊อปอัปและโหมดเต็มหน้าใช้ logic เดียวกัน ต่างกันแค่ container id

function createChatController(threadEl) {
  function appendMessage(role, html) {
    const msg = document.createElement('div');
    msg.className = `chatbot-msg ${role}`;
    if (role === 'bot') {
      msg.innerHTML = `<img class="chatbot-avatar" src="assets/images/logo.jpg" alt="">${html}`;
    } else {
      msg.innerHTML = html;
    }
    threadEl.appendChild(msg);
    threadEl.scrollTop = threadEl.scrollHeight;
    return msg;
  }

  function appendBotBubble(text, products) {
    let productsHTML = '';
    if (products && products.length) {
      productsHTML = `<div class="chatbot-products">${products.map(productCardBotHTML).join('')}</div>`;
    }
    appendMessage('bot', `<div class="chatbot-bubble">${escapeHTML(text)}${productsHTML}</div>`);
  }

  function appendUserBubble(text) {
    appendMessage('user', `<div class="chatbot-bubble">${escapeHTML(text)}</div>`);
  }

  function showTyping() {
    const msg = document.createElement('div');
    msg.className = 'chatbot-msg bot';
    msg.id = `${threadEl.id}-typing`;
    msg.innerHTML = `<img class="chatbot-avatar" src="assets/images/logo.jpg" alt=""><div class="chatbot-bubble"><div class="chatbot-typing"><span></span><span></span><span></span></div></div>`;
    threadEl.appendChild(msg);
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function hideTyping() {
    document.getElementById(`${threadEl.id}-typing`)?.remove();
  }

  async function handleUserMessage(text, onFirstMessage) {
    if (!text.trim()) return;
    if (onFirstMessage) onFirstMessage();
    appendUserBubble(text);
    showTyping();
    const start = Date.now();
    const reply = await getBotReply(text);
    const elapsed = Date.now() - start;
    const minDelay = 450;
    setTimeout(() => {
      hideTyping();
      appendBotBubble(reply.text, reply.products);
    }, Math.max(0, minDelay - elapsed));
  }

  return { appendBotBubble, appendUserBubble, handleUserMessage };
}

/* ---------------- Mode 1: floating popup widget (ทุกหน้ายกเว้นหน้าแรก) ---------------- */

function initChatWidget() {
  const toggle = document.getElementById('chatbot-toggle');
  const panel = document.getElementById('chatbot-panel');
  const closeBtn = document.getElementById('chatbot-close');
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chatbot-input');
  const threadEl = document.getElementById('chatbot-messages');

  if (!toggle || !panel || !threadEl) return;

  const chat = createChatController(threadEl);

  let greeted = false;
  const openPanel = () => {
    panel.classList.add('open');
    if (!greeted) {
      greeted = true;
      chat.appendBotBubble(`หวัดดีจ้า~ 💕 หนูคือ "${BOT_NAME}" เพื่อนซี้ประจำร้าน Cosme Outlet เองงง ✨\nอยากได้น้ำหอม สกินแคร์ หรือเครื่องสำอางค์ ทักมาถามได้เลยนะคะ หรือจะบอกงบประมาณมาก็ได้ เดี๋ยวหาให้เลยย 🥰`);
    }
    input.focus();
  };

  toggle.addEventListener('click', () => {
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
    } else {
      openPanel();
    }
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    chat.handleUserMessage(text);
  });

  document.querySelectorAll('#chatbot-panel .chatbot-chip').forEach((chip) => {
    chip.addEventListener('click', () => chat.handleUserMessage(chip.dataset.q));
  });

  ensureProducts();
}

/* ---------------- Mode 2: full-page hero chat (เฉพาะหน้าแรก) ---------------- */

function initChatHero() {
  const form = document.getElementById('chat-hero-form');
  const input = document.getElementById('chat-hero-input');
  const threadEl = document.getElementById('chat-hero-thread');
  const introEl = document.getElementById('chat-hero-intro');
  const suggestionsEl = document.getElementById('chat-hero-suggestions');
  const trustEl = document.getElementById('chat-hero-trust');

  if (!form || !input || !threadEl) return;

  const chat = createChatController(threadEl);

  const collapseIntro = () => {
    introEl?.classList.add('collapsed');
    suggestionsEl?.classList.add('collapsed');
    trustEl?.classList.add('collapsed');
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    chat.handleUserMessage(text, collapseIntro);
  });

  document.querySelectorAll('#chat-hero-suggestions .chat-hero-chip').forEach((chip) => {
    chip.addEventListener('click', () => chat.handleUserMessage(chip.dataset.q, collapseIntro));
  });

  ensureProducts();
}

document.addEventListener('DOMContentLoaded', () => {
  initChatWidget();
  initChatHero();
});
