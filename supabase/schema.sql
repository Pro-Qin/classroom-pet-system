-- ============================================================
-- 校园宠物乐园 · Supabase 云端表结构
-- 在 Supabase SQL Editor 中执行本文件，一次性创建全部同步表。
-- 与本地 SQLite schema（server/src/db/migrate.ts）保持一致。
-- 设计原则：所有记录永不硬删（deleted_at 墓碑），同步靠 updated_at 增量。
-- ============================================================

create table if not exists students (
  id text primary key,
  student_no text unique,
  name text not null,
  class_name text not null default '',
    subject text not null default '',
  points bigint not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_students_class on students (class_name);
create index if not exists idx_students_updated on students (updated_at);

create table if not exists species (
  id text primary key,
  name text not null,
  emoji text not null default '',
  avatar_path text,
  color_from text not null default '#6366f1',
  color_to text not null default '#8b5cf6',
  stage_labels text not null default '[]',
  sort bigint not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_species_updated on species (updated_at);

create table if not exists pets (
  id text primary key,
  student_id text not null unique,
  species_id text not null,
  name text not null,
  exp bigint not null default 0,
  avatar_path text,
  health bigint not null default 100,
  hungry bigint not null default 100,
  happy bigint not null default 100,
  clean bigint not null default 100,
  last_tick_at text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_pets_student on pets (student_id);
create index if not exists idx_pets_updated on pets (updated_at);

create table if not exists point_events (
  id text primary key,
  student_id text not null,
  delta bigint not null,
  reason text not null default '',
  operator text not null default 'teacher',
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_points_student on point_events (student_id);
create index if not exists idx_points_time on point_events (created_at);
create index if not exists idx_points_updated on point_events (updated_at);

create table if not exists quick_presets (
  id text primary key,
  label text not null,
  delta bigint not null,
  reason text not null default '',
  editable bigint not null default 1,
  sort bigint not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_presets_updated on quick_presets (updated_at);

create table if not exists items (
  id text primary key,
  name text not null,
  icon text not null default '',
  type text not null default 'food',
  cost bigint not null default 0,
  effect text not null default '{}',
  "desc" text not null default '',
  sort bigint not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_items_updated on items (updated_at);

create table if not exists state_rules (
  id text primary key,
  state_key text not null,
  label text not null,
  conditions text not null,
  icon text not null default '',
  color text not null default '#94a3b8',
  sort bigint not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_rules_updated on state_rules (updated_at);

-- RLS：默认关闭（本系统由服务端 service_role 写入，客户端不直连数据库）
alter table students enable row level security;
alter table species enable row level security;
alter table pets enable row level security;
alter table point_events enable row level security;
alter table quick_presets enable row level security;
alter table items enable row level security;
alter table state_rules enable row level security;