# 5 Bread 2 Fish

มินิเกมสำหรับค่าย อิงเรื่องขนมปัง 5 ก้อนกับปลา 2 ตัว เกมเริ่มด้วยขนมปัง 5 คนกับปลา 2 คน ที่เหลือยังไม่มีทีม แต่ละทีมชวนคนเข้าทีมด้วยการอธิษฐานเผื่อ ทีมที่มีคนมากที่สุดตอนประกาศผลชนะ

Web app เบาๆ เปิดผ่าน LINE (LIFF) ไม่ต้องติดตั้ง ออกแบบให้ทนสัญญาณอ่อนและใช้ง่ายสำหรับผู้สูงอายุ

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/product-design.md](docs/product-design.md) | กติกา หน้าจอ และข้อที่ยังไม่ได้ตัดสินใจ |
| [docs/tech-design.md](docs/tech-design.md) | Schema, query, routes และลำดับการทำ |
| [docs/infra.md](docs/infra.md) | Vercel Hobby + Supabase Free + LIFF และข้อจำกัดของ free tier |

## สถานะ

| ขั้น | งาน | สถานะ |
|---|---|---|
| 0 | Scaffold, deploy, เข้าระบบผ่าน LIFF | โค้ดเสร็จ รอทดสอบกับ LINE จริง |
| 1 | Schema, `assignTeam`, session + register | เสร็จ ทดสอบ 50 คนพร้อมกันบน Postgres 16 ผ่าน รอรันซ้ำบน Supabase |
| 2 | หน้าทีมของฉัน, เปลี่ยนทีม, cooldown | ยังไม่เริ่ม |
| 3 | หน้า admin + export | ยังไม่เริ่ม |
| 4 | หน้าประกาศผล | ยังไม่เริ่ม |
| 5 | ทดสอบมือถือจริง แล้วล้างข้อมูลก่อนวันค่าย | ยังไม่เริ่ม |

## Stack

Next.js 16 (App Router) ตัวเดียว ไม่มี backend แยก · Postgres บน Supabase ต่อด้วย `pg` และ raw SQL · LIFF สำหรับระบุตัวตน แล้วออก session cookie ของแอปเอง · Deploy บน Vercel region Singapore

## ตั้งค่าครั้งแรก

### 1. Supabase

1. สร้าง project ใหม่ เลือก region Singapore
2. เปิด SQL editor แล้วรันทั้งไฟล์ [`db/schema.sql`](db/schema.sql)
3. กด Connect แล้วคัดลอก connection string แบบ **Transaction pooler (port 6543)** มาเป็น `DATABASE_URL`

Schema เปิด RLS ทุกตารางโดยไม่มี policy เพื่อปิด REST API อัตโนมัติของ Supabase แอปต่อผ่าน connection string จึงไม่กระทบ

### 2. LINE

1. สร้าง channel ใน [LINE Developers Console](https://developers.line.biz/console/) แล้วเพิ่ม LIFF app ขนาด Full, scope `openid` และ `profile`
2. Endpoint URL ชี้มาที่ domain ของแอปบน Vercel
3. เก็บ Channel ID เป็น `LINE_CHANNEL_ID` และ LIFF ID เป็น `NEXT_PUBLIC_LIFF_ID`

ต้องลองเปิดลิงก์ LIFF ด้วย LINE account ที่ไม่ใช่ admin หรือ tester ของ channel ตั้งแต่ต้น ดูเหตุผลใน [docs/infra.md](docs/infra.md)

### 3. Environment variables

คัดลอก `.env.example` เป็น `.env.local` สำหรับเครื่องตัวเอง และใส่ค่าชุดเดียวกันใน Vercel (ยกเว้น `NEXT_PUBLIC_DEV_FAKE_LOGIN`)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler |
| `LINE_CHANNEL_ID` | ตรวจ ID token ฝั่ง server |
| `NEXT_PUBLIC_LIFF_ID` | `liff.init()` ฝั่ง client |
| `SESSION_SECRET` | เซ็น session cookie ต้องยาว 32 ตัวขึ้นไป |
| `ADMIN_TOKEN`, `RESULTS_TOKEN` | หน้า admin และหน้าประกาศผล (ขั้น 3 และ 4) |
| `NEXT_PUBLIC_DEV_FAKE_LOGIN` | ตั้งเป็น `1` เพื่อ login ปลอมตอนพัฒนา ไม่มีผลบน Vercel |

### 4. Vercel

Import repo นี้ ใส่ environment variables แล้ว deploy ไฟล์ `vercel.json` กำหนด region เป็น `sin1` ไว้แล้ว

## พัฒนาบนเครื่อง

```bash
npm install
npm run dev        # http://localhost:3000
```

ตั้ง `NEXT_PUBLIC_DEV_FAKE_LOGIN=1` ใน `.env.local` แล้วหน้าแรกจะมีช่องให้พิมพ์ชื่อผู้เล่นปลอม ใช้พัฒนาใน browser ปกติได้โดยไม่ต้องเปิดผ่าน LINE

| คำสั่ง | ทำอะไร |
|---|---|
| `npm test` | Unit test ของ `assignTeam` และ session cookie |
| `npm run loadtest` | ยิงลงทะเบียน 50 คนพร้อมกัน (คนละสองครั้ง) บน DB ใน `.env.local` แล้วตรวจว่าได้ขนมปัง 5 ปลา 2 และ seq ไม่ซ้ำ |
| `npm run lint` / `npm run build` | ตรวจโค้ดและ build |

`npm run loadtest` รันได้เฉพาะตอนตาราง `players` ว่าง และล้างข้อมูลที่สร้างให้เองเมื่อจบ ใส่ `-- --keep` ถ้าอยากเก็บข้อมูลไว้ดู

## โครงโปรเจกต์

```
app/
  page.tsx, my-team.tsx     หน้าผู้เล่น (LIFF endpoint)
  api/session/route.ts      POST verify ID token, ลงทะเบียน, ออก cookie
  api/me/route.ts           GET สถานะของฉัน
lib/
  assign-team.ts            แจกทีมให้ 7 คนแรก
  db.ts                     pg Pool และ transaction helper
  players.ts                ลงทะเบียน และอ่านสถานะผู้เล่น
  session.ts                เซ็นและตรวจ session cookie
  line.ts                   ตรวจ ID token กับ LINE
db/schema.sql
scripts/load-test.ts
docs/
```

## ก่อนวันค่าย

- ล้างข้อมูลหลังทดสอบระบบ ไม่งั้นคนที่ทดสอบจะกลายเป็น 7 คนแรก
- เปิด Supabase dashboard เช็กว่า project ไม่ถูก pause (free tier pause เมื่อไม่มี activity 7 วัน)
- Supabase Free ไม่มี backup ให้ export ข้อมูลเก็บไว้ทุกเย็นระหว่างค่าย (ปุ่ม export มาในขั้น 3)
