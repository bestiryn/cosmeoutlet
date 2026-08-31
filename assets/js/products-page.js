// ===== Cosme Outlet — products.html: fetch from Supabase + render + filter + search =====

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

const PAGE_SIZE = 40;
let allProductsCache = [];
let currentFilter = 'all';
let currentSearch = '';
let visibleCount = PAGE_SIZE;

function formatPrice(price) {
  const n = Number(price) || 0;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function productCardHTML(p) {
  const img = p.image_url || 'assets/images/products/placeholder.webp';
  const tag = CAT_LABEL[p.category] || p.category;
  return `
    <a class="product-card-link" href="product-detail.html?id=${p.id}">
      <div class="product-card">
        <div class="product-thumb">
          <span class="product-tag">${tag}</span>
          <img src="${img}" alt="${p.name}" loading="lazy" onerror="this.src='assets/images/logo.jpg'">
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${(p.description || '').slice(0, 90)}</div>
          <div class="product-price">${formatPrice(p.price)}</div>
        </div>
      </div>
    </a>`;
}

function getFilteredList() {
  let list = allProductsCache;
  if (currentFilter !== 'all') {
    list = list.filter((p) => p.category === currentFilter);
  }
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }
  return list;
}

function renderGrid() {
  const grid = document.getElementById('product-grid');
  const status = document.getElementById('product-status');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  const countLabel = document.getElementById('result-count');

  const filtered = getFilteredList();

  if (!filtered.length) {
    grid.innerHTML = '';
    status.style.display = 'block';
    status.textContent = 'ไม่พบสินค้าที่ตรงกับคำค้นหานี้ ลองคำอื่นดูนะคะ';
    loadMoreWrap.style.display = 'none';
    if (countLabel) countLabel.textContent = '';
    return;
  }

  status.style.display = 'none';
  const slice = filtered.slice(0, visibleCount);
  grid.innerHTML = slice.map(productCardHTML).join('');

  if (countLabel) {
    countLabel.textContent = `แสดง ${slice.length} จาก ${filtered.length} รายการ`;
  }
  loadMoreWrap.style.display = filtered.length > visibleCount ? 'block' : 'none';
}

function bindFilterBar() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      visibleCount = PAGE_SIZE;
      renderGrid();
    });
  });

  const params = new URLSearchParams(window.location.search);
  const initial = params.get('cat');
  if (initial) {
    const target = document.querySelector(`.filter-btn[data-filter="${initial}"]`);
    if (target) target.click();
  }
}

function bindSearch() {
  const input = document.getElementById('product-search');
  if (!input) return;
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = input.value.trim();
      visibleCount = PAGE_SIZE;
      renderGrid();
    }, 200);
  });
}

function bindLoadMore() {
  const btn = document.getElementById('load-more-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderGrid();
  });
}

async function loadProducts() {
  const grid = document.getElementById('product-grid');
  const status = document.getElementById('product-status');

  try {
    allProductsCache = await CosmeDB.listProducts();

    if (!allProductsCache.length) {
      status.textContent = 'ยังไม่มีสินค้าในระบบขณะนี้ กรุณาติดต่อร้านค้าเพื่อสอบถามสินค้า';
      status.style.display = 'block';
      grid.innerHTML = '';
      return;
    }

    bindFilterBar();
    bindSearch();
    bindLoadMore();
    renderGrid();
  } catch (err) {
    console.error(err);
    status.textContent = 'ไม่สามารถโหลดข้อมูลสินค้าได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อร้านค้าโดยตรง';
    status.style.display = 'block';
    grid.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', loadProducts);
