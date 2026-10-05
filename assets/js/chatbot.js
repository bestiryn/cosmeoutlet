// ===== Cosme Outlet — "แอดมินคอสเม่" chatbot UI =====
// ส่วนหน้าตา/การแสดงผลของแชท — สมองที่ใช้ตอบคำถามอยู่ที่ chatbot-engine.js (ต้อง include ก่อนไฟล์นี้)
// ไม่ได้เชื่อมกับ AI ภายนอกใด ๆ — ทำงานฝั่ง client ล้วน ๆ ไม่มีค่าใช้จ่ายเพิ่ม
//
// ใช้ 2 หน้าตา:
// 1) หน้าแรก (index.html) — แชทแบบเต็มหน้า ("chat-hero-*" elements)
// 2) หน้าอื่น ๆ — แชทแบบไอคอนลอยมุมขวาล่าง ("chatbot-*" elements)

const BOT_NAME = CosmeBotEngine.BOT_NAME;

let botProductsPromise = null;
function ensureProducts() {
  if (!botProductsPromise) {
    botProductsPromise = (typeof CosmeDB !== 'undefined' ? CosmeDB.listProducts() : Promise.resolve([]))
      .catch(() => []);
  }
  return botProductsPromise;
}

const fmtPrice = (price) => `฿${(Number(price) || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function productCardBotHTML(p) {
  const img = p.image_url || 'assets/images/logo.jpg';
  return `
    <a class="chatbot-product-card" href="product-detail.html?id=${encodeURIComponent(p.id)}">
      <img src="${escapeHTML(img)}" alt="${escapeHTML(p.name)}" onerror="this.src='assets/images/logo.jpg'">
      <div class="cpc-main">
        <div class="cpc-name">${escapeHTML(p.name)}</div>
        ${p.note ? `<div class="cpc-note">${escapeHTML(p.note)}</div>` : ''}
      </div>
      <div class="cpc-price">${fmtPrice(p.price)}</div>
    </a>`;
}

/* ---------------- Reusable chat-thread controller ---------------- */
// ใช้ logic เดียวกันทั้งโหมดป๊อปอัปและโหมดเต็มหน้า ต่างกันแค่ container
// แต่ละ controller มี session ของตัวเอง (จำว่าเคยแนะนำอะไรไปแล้ว → ถามซ้ำหรือพิมพ์ "อีก" จะได้ตัวใหม่)

function createChatController(threadEl) {
  const session = CosmeBotEngine.newSession();

  function scrollDown() { threadEl.scrollTop = threadEl.scrollHeight; }

  function appendMessage(role, html) {
    const msg = document.createElement('div');
    msg.className = `chatbot-msg ${role}`;
    msg.innerHTML = role === 'bot' ? `<img class="chatbot-avatar" src="assets/images/logo.jpg" alt=""><div class="chatbot-col">${html}</div>` : html;
    threadEl.appendChild(msg);
    scrollDown();
    return msg;
  }

  function clearSuggestions() {
    threadEl.querySelectorAll('.chatbot-suggest').forEach((el) => el.remove());
  }

  function appendBot(reply) {
    clearSuggestions();
    let inner = `<div class="chatbot-bubble">${escapeHTML(reply.text)}`;
    if (reply.products && reply.products.length) {
      inner += `<div class="chatbot-products">${reply.products.map(productCardBotHTML).join('')}</div>`;
      if (reply.moreLink) inner += `<a class="chatbot-more-link" href="${escapeHTML(reply.moreLink)}">ดูทั้งหมดในหน้าสินค้า &rarr;</a>`;
    }
    inner += '</div>';
    if (reply.suggestions && reply.suggestions.length) {
      inner += `<div class="chatbot-suggest">${reply.suggestions.map((s) => `<button type="button" class="chatbot-chip" data-q="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}</div>`;
    }
    const msg = appendMessage('bot', inner);
    msg.querySelectorAll('.chatbot-suggest .chatbot-chip').forEach((chip) => {
      chip.addEventListener('click', () => handleUserMessage(chip.dataset.q));
    });
  }

  function appendBotText(text) { appendBot({ text }); }

  function appendUser(text) {
    clearSuggestions();
    appendMessage('user', `<div class="chatbot-bubble">${escapeHTML(text)}</div>`);
  }

  function showTyping() {
    const msg = document.createElement('div');
    msg.className = 'chatbot-msg bot';
    msg.id = `${threadEl.id}-typing`;
    msg.innerHTML = '<img class="chatbot-avatar" src="assets/images/logo.jpg" alt=""><div class="chatbot-bubble"><div class="chatbot-typing"><span></span><span></span><span></span></div></div>';
    threadEl.appendChild(msg);
    scrollDown();
  }
  function hideTyping() { document.getElementById(`${threadEl.id}-typing`)?.remove(); }

  let onFirst = null;
  async function handleUserMessage(text, onFirstMessage) {
    if (!text || !text.trim()) return;
    if (onFirstMessage) onFirst = onFirstMessage;
    if (onFirst) { onFirst(); onFirst = null; }
    appendUser(text);
    showTyping();
    const start = Date.now();
    let reply;
    try {
      const products = await ensureProducts();
      reply = products.length
        ? CosmeBotEngine.respond(text, products, session)
        : { text: 'ตอนนี้โหลดรายการสินค้าไม่สำเร็จเลยค่ะ 🥺 ลองรีเฟรชหน้านี้อีกครั้งน้า หรือทักแอดมินตัวจริงทาง LINE @cosmeoutlet ได้เลย' };
    } catch (err) {
      console.error(err);
      reply = { text: 'อุ๊ย หนูตอบไม่ได้ชั่วคราวเลยค่ะ 🥺 ลองถามอีกครั้ง หรือทักแอดมินตัวจริงทาง LINE @cosmeoutlet ได้น้า' };
    }
    const wait = Math.max(0, 450 - (Date.now() - start));
    setTimeout(() => { hideTyping(); appendBot(reply); }, wait);
  }

  return { appendBotText, handleUserMessage };
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
      chat.appendBotText(`หวัดดีจ้า~ 💕 หนูคือ "${BOT_NAME}" เพื่อนซี้ประจำร้าน Cosme Outlet เองงง ✨\nบอกได้เลยว่าอยากได้อะไร เช่น "น้ำหอมกลิ่นหวานๆ ไม่เกิน 500" หรือ "สกินแคร์ลดสิว" เดี๋ยวหาให้ตรงใจเลยย 🥰`);
    }
    input.focus();
  };

  toggle.addEventListener('click', () => {
    if (panel.classList.contains('open')) panel.classList.remove('open');
    else openPanel();
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    chat.handleUserMessage(text);
  });

  document.querySelectorAll('#chatbot-panel .chatbot-quick-replies .chatbot-chip').forEach((chip) => {
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
