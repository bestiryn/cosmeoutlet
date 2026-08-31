// ===== Cosme Outlet — products.html: fetch from Supabase + render + filter =====

const CAT_LABEL = { perfume: 'น้ำหอม', skincare: 'สกินแคร์', cosmetics: 'เครื่องสำอางค์' };

function formatPrice(price) {
  const n = Number(price) || 0;
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

function productCardHTML(p) {
  const img = p.image_url || 'assets/images/products/placeholder.webp';
  const tag = CAT_LABEL[p.category] || p.category;
  return `
    <a class="product-card-link" href="product-detail.html?id=${p.id}">
      <div class="product-card" data-cat="${p.category}">
        <div class="product-thumb">
          <span class="product-tag">${tag}</span>
          <img src="${img}" alt="${p.name}" loading="lazy" onerror="this.src='assets/images/logo.jpg'">
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.description || ''}</div>
          <div class="product-price">${formatPrice(p.price)}</div>
        </div>
      </div>
    </a>`;
}

function applyFilter(cat) {
  document.querySelectorAll('.product-card').forEach((card) => {
    card.style.display = cat === 'all' || card.dataset.cat === cat ? '' : 'none';
  });
}

function bindFilterBar() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.filter);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const initial = params.get('cat');
  if (initial) {
    const target = document.querySelector(`.filter-btn[data-filter="${initial}"]`);
    if (target) target.click();
  }
}

async function loadProducts() {
  const grid = document.getElementById('product-grid');
  const status = document.getElementById('product-status');

  try {
    const products = await CosmeDB.listProducts();

    if (!products.length) {
      status.textContent = 'ยังไม่มีสินค้าในระบบขณะนี้ กรุณาติดต่อร้านค้าเพื่อสอบถามสินค้า';
      status.style.display = 'block';
      grid.innerHTML = '';
      return;
    }

    status.style.display = 'none';
    grid.innerHTML = products.map(productCardHTML).join('');
    bindFilterBar();
  } catch (err) {
    console.error(err);
    status.textContent = 'ไม่สามารถโหลดข้อมูลสินค้าได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หรือติดต่อร้านค้าโดยตรง';
    status.style.display = 'block';
    grid.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', loadProducts);
