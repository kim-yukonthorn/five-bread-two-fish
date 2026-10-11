@AGENTS.md

# 5 Bread 2 Fish

มินิเกมค่าย ขนมปัง 5 คนกับปลา 2 คน แพร่ทีมด้วยการอธิษฐานเผื่อกัน อ่านก่อนแก้โค้ด:

- `docs/product-design.md` กติกาและหน้าจอ
- `docs/tech-design.md` schema, query, routes, ลำดับการทำ (ข้อ 10)
- `docs/infra.md` Vercel Hobby + Supabase Free + LIFF และข้อจำกัดของ free tier

## สถานะ

- ขั้น 0–1 เสร็จ: scaffold, schema, `assignTeam`, session/register, `/api/me`, load test
- ถัดไป ขั้น 2: หน้าทีมของฉัน (สามสถานะ) + `POST /api/switch` + cooldown

## ข้อตกลงในโค้ด

- ใช้ `pg` กับ raw SQL ผ่าน `lib/db.ts` ไม่ใช้ ORM และห้ามใส่ `name` ใน query (Supabase pooler แบบ transaction mode ไม่รองรับ prepared statement)
- `players.team` กับ `team_events` ต้องอัปเดตใน statement หรือ transaction เดียวกันเสมอ
- API ของผู้เล่นห้ามส่งจำนวนคนของทีม
- ไม่มี web font ไม่มีรูปภาพ ข้อความในแอปเป็นภาษาไทย ตัวใหญ่ ขั้นตอนน้อย

## คำสั่ง

- `npm run dev` / `npm run build` / `npm run lint`
- `npm test` unit test (`assignTeam`, session)
- `npm run loadtest` ยิงลงทะเบียน 50 คนพร้อมกันบน DB ใน `.env.local` (ต้องเป็น DB ว่าง)
