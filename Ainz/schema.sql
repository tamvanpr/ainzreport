-- =============================================================
--  Schema "Setoran Staff" untuk Cloudflare D1 (SQLite)
--  Cara pakai: tempel blok ini ke D1 Console (per statement jika perlu)
-- =============================================================

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE,
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE,
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS task_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE,
  grup TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  title_id INTEGER NOT NULL,
  chapter TEXT NOT NULL,
  task_type_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (staff_id) REFERENCES staff (id),
  FOREIGN KEY (title_id) REFERENCES titles (id),
  FOREIGN KEY (task_type_id) REFERENCES task_types (id),
  UNIQUE (staff_id, title_id, chapter, task_type_id)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_staff ON submissions (staff_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_staff_title ON submissions (staff_id, title_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits (key);

-- OR IGNORE membuat schema aman dijalankan ulang (tidak duplikat tugas)
INSERT OR IGNORE INTO task_types (nama, grup, urutan) VALUES ('ETL', 'TL', 1);

INSERT OR IGNORE INTO task_types (nama, grup, urutan) VALUES ('KTL', 'TL', 2);

INSERT OR IGNORE INTO task_types (nama, grup, urutan) VALUES ('CTL', 'TL', 3);

INSERT OR IGNORE INTO task_types (nama, grup, urutan) VALUES ('JPL', 'TL', 4);

INSERT OR IGNORE INTO task_types (nama, grup, urutan) VALUES ('TS', NULL, 5);

INSERT OR IGNORE INTO task_types (nama, grup, urutan) VALUES ('Solo', NULL, 6);
