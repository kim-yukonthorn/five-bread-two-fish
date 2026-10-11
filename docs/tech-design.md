# 5 Bread 2 Fish — Tech Design

คู่กับ `product-design.md` · 11 ต.ค. 2026 (แก้ไข: เริ่มด้วยขนมปัง 5 คน ปลา 2 คน ที่เหลือยังไม่มีทีม)
Logic แจกทีม, schema และ query ในไฟล์นี้รันทดสอบแล้วกับ Postgres แบบ in-memory (ผู้เล่น 50 คน, connection เดียว)

## 1. Stack

| ส่วน | เลือก | เหตุผล |
|---|---|---|
| App | Next.js (App Router) ตัวเดียว | หน้าเว็บ + route handlers อยู่ที่เดียว ไม่ต้องแยก backend |
| DB | Postgres | ต้องการ transaction ตอนลงทะเบียนและเปลี่ยนทีม |
| Identity | LIFF (`@line/liff`) + session cookie ของเราเอง | ไม่ต้องพึ่ง `liff.init()` ทุกครั้งที่เปิด |
| Realtime | ไม่มี | 30–50 คน refetch ตอนเปิดหน้าก็พอ ไม่ต้อง websocket |

Hosting: Vercel region Singapore + Postgres แบบ managed ใน Singapore เร็วสุดที่จะขึ้น ถ้า self-host บน VPS ใช้ Docker + Postgres ได้เหมือนกัน schema ไม่เปลี่ยน
ถ้าใช้ serverless Postgres ต้องเลือก driver ที่รองรับ interactive transaction (ใช้ตอนลงทะเบียน)

## 2. Data model

```sql
CREATE TYPE team        AS ENUM ('bread','fish');
CREATE TYPE game_status AS ENUM ('registration','running','paused','finished');
CREATE TYPE event_kind  AS ENUM ('join','switch','admin_move');

-- แถวเดียวทั้งตาราง
CREATE TABLE game_state (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  status      game_status NOT NULL DEFAULT 'registration',
  assign_seed integer NOT NULL,           -- สุ่มครั้งเดียวตอน setup
  next_seq    integer NOT NULL DEFAULT 1, -- ลำดับลงทะเบียนถัดไป
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE TABLE players (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id   text UNIQUE,             -- NULL = admin เพิ่มให้ (ไม่มี LINE)
  display_name   text NOT NULL,
  picture_url    text,
  seq            integer NOT NULL UNIQUE, -- ลำดับลงทะเบียน
  team           team,                    -- NULL = ยังไม่มีทีม
  cooldown_until timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- log อย่างเดียวที่เก็บ ไม่มีเนื้อหาคำอธิษฐาน
CREATE TABLE team_events (
  id         bigserial PRIMARY KEY,
  player_id  uuid NOT NULL REFERENCES players(id),
  from_team  team,                        -- NULL = ยังไม่มีทีม
  to_team    team,                        -- NULL = ยังไม่มีทีม
  kind       event_kind NOT NULL,         -- join = ลงทะเบียน
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_events_time ON team_events (created_at, id);
```

`players.team` คือสถานะปัจจุบัน ส่วน `team_events` คือประวัติสำหรับ recap ทั้งสองอัปเดตใน statement/transaction เดียวกันเสมอ

## 3. ทีมเริ่มต้นตอนลงทะเบียน

7 คนแรกได้ทีม (ขนมปัง 5 ปลา 2 สุ่มลำดับ) คนที่ 8 เป็นต้นไปได้ `null`

```ts
const SEEDS = ['bread','bread','bread','bread','bread','fish','fish'] as const;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// seq เริ่มที่ 1
export function assignTeam(seq: number, seed: number) {
  if (seq > SEEDS.length) return null;
  const rand = mulberry32(seed);
  const deck = [...SEEDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck[seq - 1];
}
```

ผลทดสอบ: ลงทะเบียน 50 คน ได้ขนมปัง 5, ปลา 2, ยังไม่มีทีม 43 ทุก seed ที่ลอง

Transaction ลงทะเบียน (ต้องเรียงตามนี้ เพื่อไม่ให้ seq ซ้ำหรือมีช่องว่าง ไม่งั้นอาจได้ผู้เริ่มต้นไม่ครบ 7):

1. `SELECT assign_seed, next_seq FROM game_state FOR UPDATE` (คนที่ลงทะเบียนพร้อมกันจะเข้าคิวตรงนี้)
2. หา player จาก `line_user_id` ถ้ามีแล้ว return คนเดิม (กดซ้ำ/เปิดสองครั้งไม่กิน seq เพิ่ม)
3. `team = assignTeam(next_seq, assign_seed)`
4. `UPDATE game_state SET next_seq = next_seq + 1`
5. `INSERT players`, `INSERT team_events (kind = 'join', to_team = team)`

Admin เพิ่มคนไม่มี LINE ใช้ transaction เดียวกัน (`line_user_id = NULL`)

**ต้องล้างข้อมูลหลังทดสอบ** ไม่งั้นคนที่ทดสอบระบบจะกิน seq 1–7 ไป (ดู `/api/admin/reset`)

## 4. เปลี่ยนทีม

Client ส่งทีมปลายทาง (`$2`) มาเสมอ ทั้งคนที่ยังไม่มีทีมและคนที่ย้ายข้ามทีม Statement เดียว atomic:

```sql
WITH moved AS (
  UPDATE players p
     SET team = $2::team,
         cooldown_until = now() + interval '1 hour'
    FROM (SELECT id, team AS old_team FROM players WHERE id = $1 FOR UPDATE) o
   WHERE p.id = o.id
     AND p.team IS DISTINCT FROM $2::team
     AND (p.cooldown_until IS NULL OR p.cooldown_until <= now())
     AND EXISTS (SELECT 1 FROM game_state WHERE status = 'running')
  RETURNING p.id, o.old_team, p.team, p.cooldown_until
), ev AS (
  INSERT INTO team_events (player_id, from_team, to_team, kind)
  SELECT id, old_team, team, 'switch' FROM moved
  RETURNING 1
)
SELECT old_team, team, cooldown_until FROM moved;
```

- ได้ 1 แถว = เปลี่ยนสำเร็จ, 0 แถว = อยู่ทีมนั้นอยู่แล้ว, ติด cooldown หรือเกมไม่ได้อยู่สถานะ `running`
- **กดซ้ำตอนเน็ตหลุดไม่มีผล**: ถ้า server เปลี่ยนแล้วแต่ response ไม่ถึงมือถือ การส่งซ้ำด้วยทีมปลายทางเดิมได้ 0 แถว ดังนั้นกรณี 0 แถว API ต้องตอบสถานะปัจจุบันกลับไปเสมอ แล้ว client แสดงตามนั้น

## 5. Identity (LIFF)

ครั้งแรก:
1. Client `liff.init()` แล้ว `liff.getIDToken()`
2. `POST /api/session` ส่ง ID token
3. Server ตรวจกับ LINE: `POST https://api.line.me/oauth2/v2.1/verify` (`id_token`, `client_id` = channel ID) ได้ `sub` (userId), `name`, `picture`
4. ลงทะเบียน (ข้อ 3) แล้วออก session cookie ของเราเอง (signed, httpOnly, อายุ 7 วัน)

ครั้งถัดไป: cookie ยังอยู่ ไม่ต้องรอ LIFF เลย

ห้ามเชื่อ userId ที่ client ส่งมาตรงๆ ต้องผ่าน verify เสมอ ไม่งั้นใครก็ปลอมเป็นคนอื่นได้

ตั้งค่าฝั่ง LINE:
- LIFF app ขนาด Full, scope `openid` + `profile`, endpoint URL ชี้มาที่ domain ของแอป
- **Channel ต้องเป็นสถานะ Published ก่อนวันค่าย** ถ้ายังเป็น Developing จะใช้ได้แค่ admin/tester ของ channel (ยังไม่ได้เช็กกับ docs ล่าสุด)
- เช็กใน LINE Developers Console ว่าต้องสร้างเป็น LINE MINI App หรือ LIFF ใน LINE Login channel และแบบไหนต้องรอ review

## 6. Routes

หน้าเว็บ

| Path | ใคร | หมายเหตุ |
|---|---|---|
| `/` | ผู้เล่น | ทีมของฉัน + ปุ่มเปลี่ยนทีม (LIFF endpoint) |
| `/a/[token]` | admin | ไม่มีลิงก์จากหน้าอื่น, `noindex` |
| `/r/[token]` | จอประกาศผล | ไม่มีลิงก์จากหน้าอื่น, `noindex` |

API

| Method + Path | ทำอะไร |
|---|---|
| `POST /api/session` | verify ID token, ลงทะเบียนถ้ายังไม่มี, ออก cookie |
| `GET /api/me` | `{ team, cooldownUntil, gameStatus, serverTime }` โดย `team` เป็น `'bread' \| 'fish' \| null` |
| `POST /api/switch` | body `{ to: 'bread' \| 'fish' }` ตอบ `{ moved, team, cooldownUntil, gameStatus, serverTime }` |
| `GET /api/admin/overview` | จำนวนขนมปัง / ปลา / ยังไม่มีทีม, รายชื่อ, สถานะเกม |
| `GET /api/admin/events` | log การเปลี่ยนทีม |
| `POST /api/admin/players` | เพิ่มคนไม่มี LINE |
| `POST /api/admin/players/[id]/move` | `{ to: 'bread' \| 'fish' \| null, applyCooldown }` บันทึกเป็น `admin_move` |
| `POST /api/admin/game` | `{ action: 'start' \| 'pause' \| 'resume' }` |
| `POST /api/admin/reset` | ล้าง players + events, `next_seq = 1`, สุ่ม `assign_seed` ใหม่ ใช้ได้เฉพาะสถานะ `registration` |
| `GET /api/results` | ก่อนเปิดเผย ตอบแค่ `{ status }` ไม่ส่งตัวเลข |
| `POST /api/results/reveal` | ตั้ง `finished` + `finished_at` แล้วตอบ timeline ทั้งก้อน |

Admin และ results API รับ token ทาง header `x-admin-token` เทียบกับ `ADMIN_TOKEN` / `RESULTS_TOKEN` ใน env (สุ่มยาว 32 ตัวขึ้นไป แยกกันสองตัว เพราะ URL ประกาศผลจะขึ้นจอ)

`/api/me` และ `/api/switch` **ไม่ส่งจำนวนคนของทีม** เพื่อไม่ให้ผู้เล่นรู้ผลก่อน

`start` ควรเตือนถ้าขนมปังไม่เท่ากับ 5 หรือปลาไม่เท่ากับ 2 (เช่น ลงทะเบียนไม่ถึง 7 คน หรือ admin ย้ายผิด)

## 7. เน็ตอ่อน

- เก็บ response ล่าสุดของ `/api/me` ใน localStorage, render จากค่านี้ทันทีแล้ว refetch เบื้องหลัง
- Refetch เมื่อกลับมาที่หน้า (`visibilitychange`) ไม่ polling
- โหลด `@line/liff` แบบ dynamic import หลัง first paint และเฉพาะตอนไม่มี session
- นับถอยหลัง cooldown ใช้ offset จาก `serverTime` ไม่เชื่อนาฬิกาเครื่อง
- ปุ่มเปลี่ยนทีม: กดแล้ว disable + ข้อความ "กำลังบันทึก…" ถ้า timeout ให้ลองใหม่อัตโนมัติ (ปลอดภัยเพราะข้อ 4)
- ไม่มี web font ไม่มีรูปภาพ ใช้ system font + emoji/inline SVG
- localStorage อาจถูกล้างหรือใช้ไม่ได้ ต้อง try/catch และยังทำงานได้ถ้าไม่มี

## 8. หน้าประกาศผล

Timeline ดึงด้วย query เดียว ได้สามค่าต่อ event:

```sql
SELECT created_at, kind, bread, fish, total - bread - fish AS none
FROM (
  SELECT id, created_at, kind,
    SUM(CASE WHEN to_team='bread' THEN 1 ELSE 0 END
      - CASE WHEN from_team='bread' THEN 1 ELSE 0 END) OVER w AS bread,
    SUM(CASE WHEN to_team='fish' THEN 1 ELSE 0 END
      - CASE WHEN from_team='fish' THEN 1 ELSE 0 END) OVER w AS fish,
    SUM(CASE WHEN kind='join' THEN 1 ELSE 0 END) OVER w AS total
  FROM team_events
  WHERE created_at <= $finished_at
  WINDOW w AS (ORDER BY created_at, id)
) t
ORDER BY created_at, id;
```

- ผลสุดท้ายคือแถวสุดท้ายของ timeline (ตรงกับตาราง `players` ทดสอบแล้ว)
- `reveal` กดซ้ำได้: ถ้า `finished` แล้วไม่แก้ `finished_at` แค่ตอบ timeline เดิม (เผื่อ refresh จอ)
- Client รับ timeline ทั้งก้อนก่อน แล้วค่อยเล่น animation จึงไม่พึ่งเน็ตระหว่างเล่น

Gauge มีสามช่วง: ขนมปัง (ซ้าย) | ยังไม่มีทีม (กลาง) | ปลา (ขวา) ความกว้างตามสัดส่วนของ `bread / none / fish`

**เดินตาม event ไม่ใช่ตามเวลาจริง**: เกมกินเวลา 3 วัน ถ้าเดินตามนาฬิกา เส้นจะนิ่งเกือบทั้งคลิป (กลางคืน, ครึ่งวันที่ไม่ได้เล่น) ให้เริ่มที่สถานะตอนกดเริ่มเกม (`started_at`: 5 / ที่เหลือ / 2) แล้วเดินทีละ event ด้วยความเร็วคงที่ รวม 30–45 วินาที ขึ้นป้าย "วันที่ 1 / 2 / 3" เมื่อข้ามวัน

## 9. ค่าที่ตั้งไว้ก่อน สำหรับข้อที่ยังไม่ตัดสินใจ

| ข้อ | ค่าที่ใช้ | แก้ที่ |
|---|---|---|
| เสมอ | ประกาศว่าเสมอ | หน้า `/r` |
| Cooldown ครั้งแรกที่ได้ทีม | ติด 1 ชั่วโมงเหมือนกัน | query ข้อ 4 |
| Cooldown | นับตามเวลาจริง ไม่หยุดนับตอน pause | query ข้อ 4 |
| Admin เปลี่ยนแทน | ติด cooldown, ติ๊กออกได้ตอนแก้กดผิด | `applyCooldown` |

## 10. ลำดับการทำ

1. Schema + `assignTeam` + session/register (ทดสอบด้วย 50 คนปลอม ยิงพร้อมกันบน DB จริง)
2. หน้าทีมของฉัน (สามสถานะ) + เปลี่ยนทีม + cooldown
3. หน้า admin (จำนวน, เริ่ม/พักเกม, เปลี่ยนแทน, เพิ่มคน, log, ล้างข้อมูล)
4. หน้าประกาศผล
5. ทดสอบบนมือถือจริงผ่าน LINE ทั้ง iOS และ Android และลองกับเน็ตช้า (throttle) แล้วล้างข้อมูลก่อนวันค่าย
