-- เพิ่มชื่อเล่นผู้เล่น สำหรับ DB ที่สร้างจาก schema.sql รุ่นก่อน 4 พ.ย. 2026
-- รันครั้งเดียวใน Supabase SQL editor ก่อน deploy โค้ดที่อ่าน players.nickname
ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname text;
