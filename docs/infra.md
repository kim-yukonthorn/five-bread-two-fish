# 5 Bread 2 Fish — Infra ที่ตัดสินใจแล้ว

11 ต.ค. 2026 · ใช้คู่กับ `tech-design.md` (ไฟล์นี้ระบุตัวเลือกจริงของบรรทัด Hosting ในข้อ 1) เป้าหมายคือฟรีทั้งหมด

## สรุป

| ส่วน | ใช้ | หมายเหตุ |
|---|---|---|
| App | Vercel Hobby | ฟรี ห้ามใช้เชิงพาณิชย์ โดเมน `*.vercel.app` ใช้เป็น LIFF endpoint ได้ |
| DB | Supabase Free (Postgres) | เลือกเพราะเคยใช้แล้ว เลือก region Singapore ตอนสร้าง project |
| DB driver | `pg` (node-postgres) raw query | ไม่ใช้ ORM SQL ใน tech-design ใช้ได้ตรงๆ |
| Identity | LIFF | ตาม tech-design ข้อ 5 |

## การต่อ DB จาก Vercel

- ใช้ connection string แบบ **shared pooler, transaction mode (port 6543)** เพราะ direct connection บน Free เป็น IPv6 only
- Transaction mode ไม่รองรับ prepared statement: กับ `pg` ห้ามใส่ `name` ใน query (ถ้าเปลี่ยนไปใช้ Prisma ต้องเติม `?pgbouncer=true`, postgres.js/Drizzle ต้อง `prepare: false`)
- `BEGIN … COMMIT` + `SELECT … FOR UPDATE` ตอนลงทะเบียน ต้องยืนยันด้วยการยิง 50 คนพร้อมกันบน DB จริง (ลำดับการทำข้อ 1)

## ข้อจำกัดของ free tier ที่ต้องจัดการ

- **Supabase Free ไม่มี backup และไม่มี point-in-time recovery** จึงเพิ่ม `GET /api/admin/export` (players + team_events เป็น JSON กดได้จากหน้า `/admin`) กดเก็บทุกเย็นและก่อนประกาศผล
- **Project pause ถ้าไม่มี activity 7 วัน**: เช็ก dashboard วันก่อนค่าย ถ้า pause ให้กด restore
- Supabase Free จำกัด 2 active projects
- Vercel Hobby เก็บ runtime log 1 ชั่วโมง ใช้หน้า Log ใน admin เป็นหลักฐานหลัก

## LINE (ยังต้องยืนยัน)

- Docs แนะนำให้สร้าง LIFF app ใหม่เป็น LINE MINI App และเลือก region Thailand ได้
- ไม่ขอ verified (ใน Thailand ต้องเป็น certified provider)
- Docs ไม่ระบุชัดว่าคนที่ไม่ใช่ admin/tester เปิดได้ตอนสถานะไหน **ต้องลองเปิดด้วย LINE account ที่ไม่ใช่ admin ตั้งแต่ต้น**

## Env

`DATABASE_URL` (pooler 6543), `LINE_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID`, `SESSION_SECRET` และ `ADMIN_PIN` (ไม่บังคับ)

## แผนสำรอง

ถ้าแอปล่มกลางค่าย admin จดการเปลี่ยนทีมลงกระดาษ แล้วกรอกย้อนผ่านหน้า admin
