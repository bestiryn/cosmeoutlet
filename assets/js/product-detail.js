// ===== Cosme Outlet — product-detail.html =====

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

function formatPrice(price) {
  const n = Number(price) || 0;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function setMainImage(src, alt) {
  const main = document.getElementById('main-image');
  main.src = src;
  main.alt = alt;
  document.querySelectorAll('.detail-thumb').forEach((t) => {
    t.classList.toggle('active', t.dataset.src === src);
  });
}

function renderGallery(product) {
  const cover = product.image_url || 'assets/images/logo.jpg';
  const extra = Array.isArray(product.images) ? product.images : [];
  const allImages = [cover, ...extra.filter((u) => u && u !== cover)];

  setMainImage(allImages[0], product.name);

  const thumbsWrap = document.getElementById('detail-thumbs');
  if (allImages.length <= 1) {
    thumbsWrap.style.display = 'none';
    return;
  }
  thumbsWrap.innerHTML = allImages.map((src, i) => `
    <button type="button" class="detail-thumb${i === 0 ? ' active' : ''}" data-src="${src}">
      <img src="${src}" alt="${product.name} รูปที่ ${i + 1}" onerror="this.src='assets/images/logo.jpg'">
    </button>
  `).join('');

  thumbsWrap.querySelectorAll('.detail-thumb').forEach((btn) => {
    btn.addEventListener('click', () => setMainImage(btn.dataset.src, product.name));
  });
}

function renderBreadcrumb(product) {
  const bc = document.getElementById('breadcrumb');
  const catLink = document.createElement('a');
  catLink.href = `products.html?cat=${product.category}`;
  catLink.textContent = CAT_LABEL[product.category] || product.category;

  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '/';

  const current = document.createElement('span');
  current.className = 'current';
  current.textContent = product.name;

  bc.append(sep.cloneNode(true), catLink, sep, current);
}

async function renderRelated(product) {
  try {
    const all = await CosmeDB.listProducts();
    const related = all
      .filter((p) => p.category === product.category && String(p.id) !== String(product.id))
      .slice(0, 4);

    if (!related.length) return;

    document.getElementById('related-section').style.display = 'block';
    document.getElementById('related-grid').innerHTML = related.map((p) => `
      <a class="product-card-link" href="product-detail.html?id=${p.id}">
        <div class="product-card">
          <div class="product-thumb">
            <span class="product-tag">${CAT_LABEL[p.category] || p.category}</span>
            <img src="${p.image_url || 'assets/images/logo.jpg'}" alt="${p.name}" loading="lazy" onerror="this.src='assets/images/logo.jpg'">
          </div>
          <div class="product-body">
            <div class="product-name">${p.name}</div>
            <div class="product-desc">${p.description || ''}</div>
            <div class="product-price">${formatPrice(p.price)}</div>
          </div>
        </div>
      </a>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function bindLightbox() {
  const lightbox = document.getElementById('detail-lightbox');
  const lightboxImg = lightbox.querySelector('img');
  const mainImg = document.getElementById('main-image');

  mainImg.addEventListener('click', () => {
    lightboxImg.src = mainImg.src;
    lightbox.classList.add('open');
  });
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('detail-lightbox-close')) {
      lightbox.classList.remove('open');
      lightboxImg.src = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      lightbox.classList.remove('open');
      lightboxImg.src = '';
    }
  });
}

async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const statusEl = document.getElementById('detail-status');
  const contentEl = document.getElementById('detail-content');

  if (!id) {
    statusEl.textContent = 'ไม่พบสินค้าที่ต้องการ กรุณากลับไปเลือกสินค้าใหม่อีกครั้ง';
    return;
  }

  try {
    const product = await CosmeDB.getProduct(id);
    if (!product) {
      statusEl.textContent = 'ไม่พบสินค้านี้ อาจถูกลบไปแล้ว กรุณากลับไปเลือกสินค้าใหม่อีกครั้ง';
      return;
    }

    document.title = `${product.name} | Cosme Outlet`;
    document.getElementById('detail-cat').textContent = CAT_LABEL[product.category] || product.category;
    document.getElementById('detail-name').textContent = product.name;
    document.getElementById('detail-price').textContent = formatPrice(product.price);
    document.getElementById('detail-desc').textContent = product.description || 'ยังไม่มีรายละเอียดเพิ่มเติมสำหรับสินค้านี้';

    renderBreadcrumb(product);
    renderGallery(product);
    bindLightbox();
    renderRelated(product);

    statusEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'ไม่สามารถโหลดข้อมูลสินค้าได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
  }
}

document.addEventListener('DOMContentLoaded', loadProduct);
