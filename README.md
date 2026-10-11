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
| 1 | Schema, `assignTeam`, session + register | เสร็จ |
| 2 | หน้าทีมของฉัน, เปลี่ยนทีม, cooldown | เสร็จ |
| 3 | หน้า admin + export | เสร็จ |
| 4 | หน้าประกาศผล | เสร็จ |
| 5 | ทดสอบมือถือจริง แล้วล้างข้อมูลก่อนวันค่าย | ยังไม่เริ่ม |

ทดสอบแล้วบน Postgres 16 ในเครื่อง ด้วย `npm run loadtest` และเล่นเกมครบรอบผ่าน API กับ browser ยังไม่ได้ทดสอบกับ Supabase และ LINE จริง

## หน้าในแอป

| Path | ใคร | ทำอะไร |
|---|---|---|
| `/` | ผู้เล่น | ทีมของฉัน ปุ่มเปลี่ยนทีม นับถอยหลัง cooldown ผู้เล่นไม่เห็นจำนวนคนของแต่ละทีม |
| `/a/<ADMIN_TOKEN>` | admin | จำนวนคน รายชื่อ ย้ายทีมแทน เพิ่มคนไม่มี LINE log เริ่ม/พักเกม export ล้างข้อมูล |
| `/r/<RESULTS_TOKEN>` | จอประกาศผล | กดเริ่มแล้ว lock เกม เล่น recap เป็น gauge ทีละ event แล้วประกาศทีมที่ชนะ |

สองหน้าหลังไม่มีลิงก์จากหน้าอื่น เข้าได้ด้วย URL ที่มี token เท่านั้น การกดเริ่มในหน้าประกาศผลจบเกมทันทีและย้อนกลับไม่ได้ อย่าเปิดหน้านี้เล่นระหว่างเกม

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
| `ADMIN_TOKEN`, `RESULTS_TOKEN` | token ใน URL ของหน้า admin และหน้าประกาศผล ยาว 32 ตัวขึ้นไป สุ่มแยกกันสองตัว |
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
| `npm run loadtest` | เล่นเกมจำลองบน DB ใน `.env.local`: ลงทะเบียน 50 คนพร้อมกัน เปลี่ยนทีมพร้อมกัน พักเกม ประกาศผล แล้วตรวจผลทุกขั้น |
| `npm run lint` / `npm run build` | ตรวจโค้ดและ build |

`npm run loadtest` รันได้เฉพาะตอนตาราง `players` ว่าง และล้างข้อมูลที่สร้างให้เองเมื่อจบ ใส่ `-- --keep` ถ้าอยากเก็บข้อมูลไว้ดู

## โครงโปรเจกต์

```
app/
  page.tsx, my-team.tsx     หน้าผู้เล่น (LIFF endpoint)
  me-store.ts               cache สถานะล่าสุดใน localStorage
  a/[token]/                หน้า admin
  r/[token]/                หน้าประกาศผล
  ui/                       ชื่อทีม ไอคอน และนาฬิกานับถอยหลัง
  api/session, api/me       เข้าระบบ และสถานะของฉัน
  api/switch                เปลี่ยนทีม
  api/admin/*               overview, events, players, game, reset, export
  api/results, api/results/reveal
lib/
  assign-team.ts            แจกทีมให้ 7 คนแรก
  db.ts                     pg Pool และ transaction helper
  players.ts                ลงทะเบียน อ่านสถานะ เปลี่ยนทีม
  admin.ts                  งานฝั่ง admin ทั้งหมด
  results.ts                ประกาศผลและ timeline
  session.ts, line.ts       session cookie และตรวจ ID token กับ LINE
  admin-auth.ts             ตรวจ token ของ admin และหน้าประกาศผล
db/schema.sql
scripts/load-test.ts
docs/
```

## ก่อนวันค่าย

- ล้างข้อมูลหลังทดสอบระบบ ไม่งั้นคนที่ทดสอบจะกลายเป็น 7 คนแรก
- เปิด Supabase dashboard เช็กว่า project ไม่ถูก pause (free tier pause เมื่อไม่มี activity 7 วัน)
- Supabase Free ไม่มี backup ให้กด Export ในหน้า admin เก็บไฟล์ไว้ทุกเย็นระหว่างค่าย และอีกครั้งก่อนประกาศผล
- ทดสอบครบรอบถึงประกาศผลแล้ว ล้างข้อมูลได้จากหน้า admin (ใช้ได้ตอนช่วงลงทะเบียนและหลังจบเกม)
