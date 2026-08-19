-- ============================================================================
-- VTG Parking — 正式上线前测试数据清除脚本
-- ============================================================================
-- 使用前提：
--   1. 已在 Supabase → Settings → Backups 做过一次完整备份（或已执行 Step 1 导出）
--   2. 已确认本脚本连接的是**生产数据库**，且没有真实住户数据在里面
--   3. 存储桶（registration-docs / violation-photos）需另行清理，见 scripts/clear-storage.mjs
--
-- 执行方式：Supabase → SQL Editor，分段执行（不要一次性全贴）。
-- ============================================================================


-- ─── STEP 1：清除前盘点（只读，先跑这一段确认数量）────────────────────────────
select 'units'                     as table_name, count(*) from units
union all select 'admin_users',               count(*) from admin_users
union all select 'notification_emails',       count(*) from notification_emails
union all select 'resident_vehicles',         count(*) from resident_vehicles
union all select 'visitor_registrations',     count(*) from visitor_registrations
union all select 'vacation_parking_requests', count(*) from vacation_parking_requests
union all select 'violation_reports',         count(*) from violation_reports
union all select 'abuse_alerts',              count(*) from abuse_alerts
union all select 'email_otps',                count(*) from email_otps
union all select 'oversized_applications',    count(*) from oversized_applications
order by 1;

-- 逻辑备份（可选但强烈建议）：把清除前的快照留一份在同库的 archive schema 里
-- create schema if not exists pre_launch_archive;
-- create table pre_launch_archive.resident_vehicles         as select * from resident_vehicles;
-- create table pre_launch_archive.visitor_registrations     as select * from visitor_registrations;
-- create table pre_launch_archive.vacation_parking_requests as select * from vacation_parking_requests;
-- create table pre_launch_archive.violation_reports         as select * from violation_reports;
-- create table pre_launch_archive.abuse_alerts              as select * from abuse_alerts;
-- create table pre_launch_archive.units                     as select * from units;
-- create table pre_launch_archive.admin_users               as select * from admin_users;
-- （上线稳定运行 1 个月后再 drop schema pre_launch_archive cascade;）


-- ─── STEP 2：清除全部业务交易数据 ────────────────────────────────────────────
-- 这些表 100% 是测试产生的，全部清空。TRUNCATE 比 DELETE 快且回收空间。
-- 不带 CASCADE：这些表都没有被别的表引用，若报错说明有未预期的外键，停下来查。
begin;

truncate table
  resident_vehicles,
  visitor_registrations,
  vacation_parking_requests,
  abuse_alerts,
  violation_reports,
  oversized_applications,   -- 遗留表，理论上已空
  email_otps;               -- 一次性验证码，全部作废

commit;


-- ─── STEP 2b：删掉 resident_vehicles.registration_doc_url（expand/contract 收尾）──
-- 2026-08-19 把行驶证从公开桶改成私有桶时，新增了 registration_doc_path 存对象路径，
-- 旧的 registration_doc_url（存完整公开 URL）刻意留着没删，作为零成本的回滚退路：
-- 只要旧列还在，回退部署就能立刻恢复旧版，数据库完全不用动。
--
-- 决定（2026-08-19）：不单独做一次迁移，等清库时一起删 —— 反正 STEP 2 已经把整张表
-- truncate 掉了，此时删列既没有数据可丢，也不再需要回滚退路。
--
-- 必须在 STEP 2 之后执行。守卫是多余的保险：表为空时行数必然为 0。
DO $$
DECLARE
  v_would_lose integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='resident_vehicles'
      AND column_name='registration_doc_url'
  ) THEN
    RAISE NOTICE 'registration_doc_url 已不存在，跳过';
    RETURN;
  END IF;

  SELECT count(*) INTO v_would_lose
  FROM resident_vehicles
  WHERE registration_doc_url IS NOT NULL AND registration_doc_path IS NULL;

  IF v_would_lose > 0 THEN
    RAISE EXCEPTION '中止：% 行只有旧列没有新列，删列会丢数据。先确认 STEP 2 的 truncate 已执行。', v_would_lose;
  END IF;

  ALTER TABLE resident_vehicles DROP COLUMN registration_doc_url;
  RAISE NOTICE 'registration_doc_url 已删除';
END $$;

-- 反向恢复配方（万一删早了又需要回退到旧版代码）：
--   ALTER TABLE resident_vehicles ADD COLUMN registration_doc_url text;
--   UPDATE resident_vehicles
--      SET registration_doc_url =
--          '<你的 Supabase Project URL>/storage/v1/object/public/registration-docs/' || registration_doc_path
--    WHERE registration_doc_path IS NOT NULL;
--   UPDATE storage.buckets SET public = true WHERE id = 'registration-docs';


-- ─── STEP 3：主数据（units）—— 不要盲删，用真实门牌表替换 ────────────────────
-- 3a. 先看现有门牌是不是测试数据
select unit_number, address, active, created_at
from units order by unit_number limit 50;

-- 3b. 方案 A（推荐）：清空后从管理后台「门牌号管理 → 从 Excel 导入」重新导入真实门牌表。
--     注意 resident_vehicles / visitor_registrations / vacation_parking_requests
--     对 units 是 ON DELETE CASCADE —— 必须先跑完 STEP 2 再删 units，否则会连带删数据。
-- begin;
-- truncate table units cascade;
-- commit;

-- 3c. 方案 B：真实门牌已经在库里，只删测试门牌（按你的测试命名规则改条件）
-- delete from units
-- where unit_number ilike 'TEST%' or unit_number ilike '测试%' or address ilike '%test%';

-- 3d. 导入后校验：门牌数应等于社区实际户数，且无重复、无空地址
select count(*) as total_units,
       count(*) filter (where active) as active_units,
       count(*) filter (where address is null or btrim(address) = '') as bad_address
from units;


-- ─── STEP 4：账号（admin_users）—— 保留真人账号，删测试账号，全部重置密码 ────
-- 4a. 盘点
select id, username, role, display_name, email, active, last_login, created_at
from admin_users order by role, username;

-- 4b. 删除测试账号（按实际情况改 IN 列表；不要误删要保留的真人账号）
-- delete from admin_users
-- where username in ('admin', 'test', 'patrol01', 'demo');

-- 4c. 保留的账号一律重置为新的强随机密码（bcrypt cost=10，逐个生成，勿用可预测规则）
--     node -e "require('bcryptjs').hash('<强随机密码>', 10).then(console.log)"
-- update admin_users set password_hash = '<新hash>', last_login = null where username = 'admin_jf';

-- 4d. 校验：管理员必须有 email（登录要发 OTP），巡逻员可空
select username, role,
       case when role = 'admin' and coalesce(btrim(email), '') = '' then '❌ 缺少 email' else 'ok' end as email_check
from admin_users where active;


-- ─── STEP 5：通知邮箱（notification_emails）—— 换成真实收件人 ────────────────
select id, email, label, active from notification_emails order by email;
-- delete from notification_emails where email ilike '%example.com' or email ilike '%test%';
-- 之后在管理后台「通知邮箱」页面添加真实的 HOA 收件人。


-- ─── STEP 6：清除后校验（应全部为 0，除 units / admin_users / notification_emails）──
select 'units'                     as table_name, count(*) from units
union all select 'admin_users',               count(*) from admin_users
union all select 'notification_emails',       count(*) from notification_emails
union all select 'resident_vehicles',         count(*) from resident_vehicles
union all select 'visitor_registrations',     count(*) from visitor_registrations
union all select 'vacation_parking_requests', count(*) from vacation_parking_requests
union all select 'violation_reports',         count(*) from violation_reports
union all select 'abuse_alerts',              count(*) from abuse_alerts
union all select 'email_otps',                count(*) from email_otps
union all select 'oversized_applications',    count(*) from oversized_applications
order by 1;

-- 清除不会影响以下对象，但上线前顺手确认它们还在：
select proname from pg_proc where proname in ('book_visitor_registration', 'update_updated_at');
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
select policyname, tablename from pg_policies where schemaname = 'public';

-- 回收空间（TRUNCATE 已回收，这步主要是刷新统计信息）
-- vacuum analyze;
