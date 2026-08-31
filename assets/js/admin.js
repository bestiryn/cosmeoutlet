// ===== Cosme Outlet — admin.html logic =====
// คำเตือน: PIN นี้เป็นเพียงด่านกั้นฝั่ง browser (ป้องกันคนทั่วไปไม่ให้เปิดหน้านี้เจอ)
// ไม่ใช่การยืนยันตัวตนจริงฝั่งฐานข้อมูล ผู้ที่รู้ URL ของ Supabase REST API และ anon key
// (ซึ่งอยู่ใน supabase-client.js อยู่แล้ว) จะเรียก API เพิ่ม/แก้/ลบสินค้าได้โดยตรงอยู่ดี
// เหมาะกับการใช้งานภายในร้าน ไม่เหมาะกับเว็บสาธารณะที่มีความเสี่ยงสูง

const ADMIN_PIN = '987123';
const SESSION_KEY = 'cosme_admin_session';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

const CAT_LABEL = {
  perfume: 'น้ำหอม',
  skincare: 'สกินแคร์',
  cosmetics: 'เครื่องสำอางค์',
  bags: 'กระเป๋า',
  pouches: 'ถุง',
  food: 'อาหาร',
  supplements: 'อาหารเสริม',
  general: 'ทั่วไป',
};

let allProducts = [];
let currentGalleryImages = [];
let failedAttempts = 0;
let lockedUntil = 0;

/* ---------------- PIN gate ---------------- */

function initPinGate() {
  const pinScreen = document.getElementById('pin-screen');
  const adminApp = document.getElementById('admin-app');

  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    pinScreen.style.display = 'none';
    adminApp.style.display = 'block';
    bootDashboard();
    return;
  }

  const inputs = Array.from(document.querySelectorAll('#pin-inputs input'));
  const pinInputsWrap = document.getElementById('pin-inputs');
  const errorEl = document.getElementById('pin-error');
  const submitBtn = document.getElementById('pin-submit');

  inputs[0].focus();

  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
      if (e.key === 'Enter') attemptLogin();
    });
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '');
      if (!text) return;
      e.preventDefault();
      text.split('').slice(0, inputs.length).forEach((ch, i) => { inputs[i].value = ch; });
      inputs[Math.min(text.length, inputs.length) - 1].focus();
    });
  });

  submitBtn.addEventListener('click', attemptLogin);

  function attemptLogin() {
    const now = Date.now();
    if (now < lockedUntil) {
      showError(`ลองผิดหลายครั้งเกินไป กรุณารออีก ${Math.ceil((lockedUntil - now) / 1000)} วินาที`);
      return;
    }

    const value = inputs.map((i) => i.value).join('');
    if (value.length < 6) {
      showError('กรุณากรอกรหัส PIN ให้ครบ 6 หลัก');
      shake();
      return;
    }

    if (value === ADMIN_PIN) {
      sessionStorage.setItem(SESSION_KEY, '1');
      pinScreen.style.display = 'none';
      adminApp.style.display = 'block';
      bootDashboard();
      return;
    }

    failedAttempts += 1;
    inputs.forEach((i) => { i.value = ''; });
    inputs[0].focus();
    shake();

    if (failedAttempts >= MAX_ATTEMPTS) {
      lockedUntil = Date.now() + LOCKOUT_MS;
      failedAttempts = 0;
      showError(`รหัส PIN ไม่ถูกต้องหลายครั้งเกินไป กรุณารอ ${LOCKOUT_MS / 1000} วินาที`);
    } else {
      showError(`รหัส PIN ไม่ถูกต้อง (ลองแล้ว ${failedAttempts}/${MAX_ATTEMPTS} ครั้ง)`);
    }
  }

  function shake() {
    pinInputsWrap.classList.remove('shake');
    void pinInputsWrap.offsetWidth;
    pinInputsWrap.classList.add('shake');
  }

  function showError(msg) {
    errorEl.textContent = msg;
  }
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.reload();
});

/* ---------------- Dashboard ---------------- */

function bootDashboard() {
  loadProducts();

  document.getElementById('add-product-btn').addEventListener('click', () => openModal());
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('product-modal').addEventListener('click', (e) => {
    if (e.target.id === 'product-modal') closeModal();
  });
  document.getElementById('product-form').addEventListener('submit', handleSubmit);
  document.getElementById('field-image-file').addEventListener('change', handleImageFile);
  document.getElementById('field-image-url').addEventListener('input', (e) => {
    document.getElementById('image-preview').src = e.target.value || 'assets/images/logo.jpg';
  });
  document.getElementById('field-gallery-files').addEventListener('change', handleGalleryFiles);
  document.getElementById('search-input').addEventListener('input', () => { adminPage = 1; renderTable(); });
  document.getElementById('category-filter-select').addEventListener('change', () => { adminPage = 1; renderTable(); });
}

async function loadProducts() {
  const statusEl = document.getElementById('admin-status');
  const tableWrap = document.getElementById('admin-table-wrap');
  try {
    statusEl.style.display = 'none';
    allProducts = await CosmeDB.listProducts();
    tableWrap.style.display = '';
    renderTable();
    renderStats();
  } catch (err) {
    console.error(err);
    tableWrap.style.display = 'none';
    statusEl.style.display = 'block';
    statusEl.textContent = 'โหลดข้อมูลสินค้าไม่สำเร็จ: ' + err.message;
  }
}

function renderStats() {
  document.getElementById('stat-total').textContent = allProducts.length;
  document.getElementById('stat-perfume').textContent = allProducts.filter((p) => p.category === 'perfume').length;
  document.getElementById('stat-skincare').textContent = allProducts.filter((p) => p.category === 'skincare').length;
  document.getElementById('stat-cosmetics').textContent = allProducts.filter((p) => p.category === 'cosmetics').length;
}

const ADMIN_PAGE_SIZE = 60;
let adminPage = 1;

function renderTable() {
  const query = (document.getElementById('search-input').value || '').trim().toLowerCase();
  const catFilter = document.getElementById('category-filter-select').value;
  let list = query ? allProducts.filter((p) => p.name.toLowerCase().includes(query)) : allProducts;
  if (catFilter) list = list.filter((p) => p.category === catFilter);

  const tbody = document.getElementById('product-table-body');
  const pagerEl = document.getElementById('admin-pagination');

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:30px;">ไม่พบสินค้า</td></tr>`;
    pagerEl.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(list.length / ADMIN_PAGE_SIZE));
  if (adminPage > totalPages) adminPage = totalPages;
  const start = (adminPage - 1) * ADMIN_PAGE_SIZE;
  const pageList = list.slice(start, start + ADMIN_PAGE_SIZE);

  pagerEl.innerHTML = `
    <button type="button" class="btn btn-outline btn-sm" id="admin-prev-page" ${adminPage <= 1 ? 'disabled' : ''}>&larr; ก่อนหน้า</button>
    <span>หน้า ${adminPage} / ${totalPages} (${list.length} รายการ)</span>
    <button type="button" class="btn btn-outline btn-sm" id="admin-next-page" ${adminPage >= totalPages ? 'disabled' : ''}>ถัดไป &rarr;</button>
  `;
  document.getElementById('admin-prev-page')?.addEventListener('click', () => { adminPage -= 1; renderTable(); });
  document.getElementById('admin-next-page')?.addEventListener('click', () => { adminPage += 1; renderTable(); });

  renderTableRows(pageList, tbody);
}

function renderTableRows(list, tbody) {
  tbody.innerHTML = list.map((p) => `
    <tr>
      <td><img class="admin-thumb" src="${p.image_url || 'assets/images/logo.jpg'}" alt="${p.name}" onerror="this.src='assets/images/logo.jpg'"></td>
      <td>${p.name}</td>
      <td><span class="admin-cat-badge">${CAT_LABEL[p.category] || p.category}</span></td>
      <td>฿${Number(p.price).toLocaleString('th-TH')}</td>
      <td>
        <div class="admin-row-actions">
          <button class="icon-btn" title="แก้ไข" data-edit="${p.id}">✎</button>
          <button class="icon-btn danger" title="ลบ" data-delete="${p.id}">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.delete));
  });
}

/* ---------------- Add / edit modal ---------------- */

function openModal(id) {
  const form = document.getElementById('product-form');
  form.reset();
  document.getElementById('form-error').textContent = '';
  document.getElementById('image-preview').src = 'assets/images/logo.jpg';

  if (id) {
    const p = allProducts.find((x) => String(x.id) === String(id));
    if (!p) return;
    document.getElementById('modal-title').textContent = 'แก้ไขสินค้า';
    document.getElementById('product-id').value = p.id;
    document.getElementById('field-name').value = p.name;
    document.getElementById('field-category').value = p.category;
    document.getElementById('field-price').value = p.price;
    document.getElementById('field-desc').value = p.description || '';
    document.getElementById('field-image-url').value = p.image_url || '';
    document.getElementById('image-preview').src = p.image_url || 'assets/images/logo.jpg';
    currentGalleryImages = Array.isArray(p.images) ? [...p.images] : [];
  } else {
    document.getElementById('modal-title').textContent = 'เพิ่มสินค้าใหม่';
    document.getElementById('product-id').value = '';
    currentGalleryImages = [];
  }

  renderGalleryThumbs();
  document.getElementById('product-modal').classList.add('open');
}

function renderGalleryThumbs() {
  const wrap = document.getElementById('gallery-thumbs');
  wrap.innerHTML = currentGalleryImages.map((url, i) => `
    <div class="gallery-thumb">
      <img src="${url}" alt="รูปเพิ่มเติม ${i + 1}" onerror="this.src='assets/images/logo.jpg'">
      <button type="button" data-remove="${i}" title="ลบรูปนี้">&times;</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentGalleryImages.splice(Number(btn.dataset.remove), 1);
      renderGalleryThumbs();
    });
  });
}

async function handleGalleryFiles(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const errorEl = document.getElementById('form-error');

  errorEl.textContent = `กำลังอัปโหลดรูปเพิ่มเติม (${files.length} ไฟล์)...`;
  try {
    for (const file of files) {
      const url = await CosmeDB.uploadImage(file);
      currentGalleryImages.push(url);
      renderGalleryThumbs();
    }
    errorEl.textContent = '';
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'อัปโหลดรูปเพิ่มเติมไม่สำเร็จ: ' + err.message;
  } finally {
    e.target.value = '';
  }
}

function closeModal() {
  document.getElementById('product-modal').classList.remove('open');
}

async function handleImageFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('image-preview');
  const urlField = document.getElementById('field-image-url');
  const errorEl = document.getElementById('form-error');

  preview.src = URL.createObjectURL(file);
  errorEl.textContent = 'กำลังอัปโหลดรูปภาพ...';
  try {
    const url = await CosmeDB.uploadImage(file);
    urlField.value = url;
    errorEl.textContent = '';
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'อัปโหลดรูปไม่สำเร็จ: ' + err.message;
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('form-error');
  const submitBtn = document.getElementById('modal-submit');

  const id = document.getElementById('product-id').value;
  const payload = {
    name: document.getElementById('field-name').value.trim(),
    category: document.getElementById('field-category').value,
    price: Number(document.getElementById('field-price').value) || 0,
    description: document.getElementById('field-desc').value.trim(),
    image_url: document.getElementById('field-image-url').value.trim(),
    images: currentGalleryImages,
  };

  if (!payload.name) {
    errorEl.textContent = 'กรุณากรอกชื่อสินค้า';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังบันทึก...';
  errorEl.textContent = '';

  try {
    if (id) {
      await CosmeDB.updateProduct(id, payload);
      showToast('แก้ไขสินค้าเรียบร้อยแล้ว', 'success');
    } else {
      await CosmeDB.createProduct(payload);
      showToast('เพิ่มสินค้าใหม่เรียบร้อยแล้ว', 'success');
    }
    closeModal();
    await loadProducts();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'บันทึกไม่สำเร็จ: ' + err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'บันทึกสินค้า';
  }
}

async function handleDelete(id) {
  const p = allProducts.find((x) => String(x.id) === String(id));
  if (!p) return;
  if (!confirm(`ต้องการลบสินค้า "${p.name}" ใช่หรือไม่?`)) return;

  try {
    await CosmeDB.deleteProduct(id);
    showToast('ลบสินค้าเรียบร้อยแล้ว', 'success');
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast('ลบไม่สำเร็จ: ' + err.message, 'error');
  }
}

/* ---------------- Toast ---------------- */

let toastTimer;
function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type || ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

/* ---------------- Init ---------------- */

document.addEventListener('DOMContentLoaded', initPinGate);
