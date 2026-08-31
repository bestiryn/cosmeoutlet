// ===== Cosme Outlet — shared behaviour =====
document.addEventListener('DOMContentLoaded', () => {
  // mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // NOTE: product category filter now lives in products-page.js
  // (it must bind after products are fetched from Supabase, not on page load)

  // review lightbox (reviews.html)
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    const lightboxImg = lightbox.querySelector('img');
    document.querySelectorAll('.review-grid figure img').forEach(img => {
      img.addEventListener('click', () => {
        lightboxImg.src = img.src;
        lightbox.classList.add('open');
      });
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
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
});
