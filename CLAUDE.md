@AGENTS.md

# 5 Bread 2 Fish

มินิเกมค่าย ขนมปัง 5 คนกับปลา 2 คน แพร่ทีมด้วยการอธิษฐานเผื่อกัน อ่านก่อนแก้โค้ด:

- `docs/product-design.md` กติกาและหน้าจอ
- `docs/tech-design.md` schema, query, routes, ลำดับการทำ (ข้อ 10)
- `docs/infra.md` Vercel Hobby + Supabase Free + LIFF และข้อจำกัดของ free tier

## สถานะ

- ขั้น 0–4 เสร็จ: ลงทะเบียน, จอผู้เล่น + เปลี่ยนทีม + cooldown, หน้า admin + export, หน้าประกาศผล
- เหลือขั้น 5: ทดสอบบนมือถือจริงผ่าน LINE (iOS + Android) กับเน็ตช้า แล้วล้างข้อมูลก่อนวันค่าย
- จุดที่โค้ดต่างจากเอกสารอยู่ใน `docs/tech-design.md` ข้อ 11

## ข้อตกลงในโค้ด

- ใช้ `pg` กับ raw SQL ผ่าน `lib/db.ts` ไม่ใช้ ORM และห้ามใส่ `name` ใน query (Supabase pooler แบบ transaction mode ไม่รองรับ prepared statement)
- `players.team` กับ `team_events` ต้องอัปเดตใน statement หรือ transaction เดียวกันเสมอ
- API ของผู้เล่นห้ามส่งจำนวนคนของทีม
- ไม่มี web font ไม่มีรูปภาพ ข้อความในแอปเป็นภาษาไทย ตัวใหญ่ ขั้นตอนน้อย
- Admin และ results API ตรวจ token จาก header `x-admin-token` ทุก route ตัวหน้า `/a/[token]` กับ `/r/[token]` ไม่ตรวจเอง
- setState ใน effect ต้องอยู่ใน callback ของ promise หรือ event (lint `react-hooks/set-state-in-effect`)

## คำสั่ง

- `npm run dev` / `npm run build` / `npm run lint`
- `npm test` unit test (`assignTeam`, session)
- `npm run loadtest` เล่นเกมจำลองแบบยิงพร้อมกันบน DB ใน `.env.local` ตั้งแต่ลงทะเบียนถึงประกาศผล (ต้องเป็น DB ว่าง และล้างให้เองเมื่อจบ)
