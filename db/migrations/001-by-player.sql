-- เพิ่มคนที่อธิษฐานเผื่อใน team_events สำหรับ DB ที่สร้างจาก schema.sql รุ่นก่อน 3 พ.ย. 2026
-- รันครั้งเดียวใน Supabase SQL editor ก่อน deploy โค้ดที่ส่ง by_player_id
ALTER TABLE team_events ADD COLUMN IF NOT EXISTS by_player_id uuid REFERENCES players(id);
