-- ============================================================================
-- Cosme Outlet — migration 003: ขยายหมวดหมู่สินค้าให้ครบทุกหมวดของร้าน
--
-- เดิมตาราง products อนุญาตแค่ 3 หมวด (perfume, skincare, cosmetics)
-- ตอนนี้จะดึงสินค้าทั้งหมด 736 รายการจากร้านจริงเข้ามา ซึ่งมีครบ 8 หมวดหมู่
-- จึงต้องขยาย check constraint ให้รองรับหมวดที่เหลือด้วย
--
-- วิธีใช้: เปิด Supabase SQL Editor แล้ววางไฟล์นี้ทั้งหมด กด Run (รันครั้งเดียวพอ)
-- ============================================================================

alter table public.products drop constraint if exists products_category_check;

alter table public.products add constraint products_category_check
  check (category in (
    'perfume',      -- น้ำหอม
    'skincare',     -- สกินแคร์
    'cosmetics',    -- เครื่องสำอางค์
    'bags',         -- กระเป๋า
    'pouches',      -- ถุง
    'food',         -- อาหาร
    'supplements',  -- อาหารเสริม
    'general'       -- ทั่วไป
  ));
