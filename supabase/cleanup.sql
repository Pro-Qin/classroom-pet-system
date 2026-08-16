-- ============================================================
-- 校园宠物乐园 · 云端清理脚本（丢弃旧表，全新开始）
-- 在 Supabase SQL Editor 中运行本文件，然后再运行 schema.sql
-- ============================================================

drop table if exists item_use_logs;
drop table if exists backpacks;
drop table if exists point_events;
drop table if exists pets;
drop table if exists quick_presets;
drop table if exists state_rules;
drop table if exists items;
drop table if exists species;
drop table if exists students;
drop table if exists teachers;
drop table if exists sync_meta;
drop table if exists tombstones;
drop table if exists migrations;
drop table if exists audit_logs;
drop table if exists settings;
