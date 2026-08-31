// ===== Cosme Outlet — Supabase REST client (public anon key only) =====
// เชื่อมต่อ Supabase ผ่าน REST API ตรง ๆ ด้วย fetch (ไม่ต้องโหลด SDK เพิ่ม)
// ใช้ได้เฉพาะ anon public key เท่านั้น ห้ามใส่ service_role key ที่นี่เด็ดขาด
// (service_role key ข้าม Row Level Security ทั้งหมด เท่ากับสิทธิ์แอดมินสูงสุดของฐานข้อมูล
// ถ้าฝังในไฟล์ที่รันบน browser ใครก็เปิด View Source อ่านแล้วเอาไปใช้ต่อได้ทันที)

const SUPABASE_URL = 'https://hjqzrckzffqadloviaps.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcXpyY2t6ZmZxYWRsb3ZpYXBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNTg4NDQsImV4cCI6MjEwMzczNDg0NH0.m4tvkra8cBcN2Mr3EhLZVbSsPnrJtC1TVn9X1crlu2U';

const STORAGE_BUCKET = 'product-images';

function authHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

async function parseErrorMessage(res) {
  try {
    const body = await res.json();
    return body.message || body.error_description || body.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

const CosmeDB = {
  /** ดึงสินค้าทั้งหมด เรียงตามวันที่เพิ่มล่าสุดก่อน */
  async listProducts() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    return res.json();
  },

  /** ดึงสินค้าชิ้นเดียวตาม id */
  async getProduct(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=*`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    const rows = await res.json();
    return rows[0] || null;
  },

  async createProduct(product) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    const rows = await res.json();
    return rows[0];
  },

  async updateProduct(id, product) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: 'PATCH',
      headers: authHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(product),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    const rows = await res.json();
    return rows[0];
  },

  async deleteProduct(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
  },

  /** อัปโหลดรูปสินค้าไปที่ Supabase Storage แล้วคืน URL สาธารณะ */
  async uploadImage(file) {
    const safeExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
      body: file,
    });
    if (!res.ok) throw new Error(await parseErrorMessage(res));
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  },
};
