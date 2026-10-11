-- 5 Bread 2 Fish — schema (ดู docs/tech-design.md ข้อ 2)
-- รันครั้งเดียวบน database เปล่า เช่น วางใน Supabase SQL editor

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

INSERT INTO game_state (assign_seed) VALUES (floor(random() * 2147483647)::int);

-- Supabase เปิด REST API ให้ทุกตารางใน schema public โดยอัตโนมัติ
-- เปิด RLS โดยไม่มี policy เพื่อปิดทางนั้น แอปต่อผ่าน connection string (role เจ้าของตาราง) จึงไม่กระทบ
ALTER TABLE game_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
