/**
 * 清理 registration-docs 桶里的孤儿文件 —— 没有任何 resident_vehicles 行引用的文件。
 *
 *   node scripts/clean-orphan-docs.mjs            # 只列出，不删除（dry run）
 *   node scripts/clean-orphan-docs.mjs --delete   # 真正删除
 *
 * 与 clear-storage.mjs 的区别：那个清空整个桶（清库时用），这个只删没人用的，
 * 可以在系统正常运行时执行。
 *
 * 孤儿从哪来：
 *   1. 删车/删单元时只删了数据库行，没删文件（2026-08-20 已在代码里修复）
 *   2. 住户在首次登记表单里传了文件却没提交（temp_ 前缀），这类无法从代码侧避免
 *
 * 用 DATABASE_URL 直连读数据库，用 service_role 调存储 API。
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('找不到 .env.local，请在 vtg-parking/ 目录下运行。');
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const DELETE = process.argv.includes('--delete');
const BUCKET = 'registration-docs';

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// storage.objects is the authoritative list; comparing in SQL avoids paging the
// bucket through the API and keeps the reference check in one atomic read.
const { rows: orphans } = await db.query(`
  select o.name,
         coalesce((o.metadata->>'size')::bigint, 0) as size,
         o.created_at
    from storage.objects o
   where o.bucket_id = $1
     and not exists (
       select 1 from resident_vehicles v where v.registration_doc_path = o.name
     )
   order by o.created_at
`, [BUCKET]);

const { rows: [totals] } = await db.query(`
  select (select count(*) from storage.objects where bucket_id = $1) as total,
         (select count(*) from resident_vehicles where registration_doc_path is not null) as referenced
`, [BUCKET]);
await db.end();

const mb = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MB`;
const totalSize = orphans.reduce((s, o) => s + Number(o.size), 0);

console.log(`\n桶内文件 ${totals.total} 个，被数据库引用 ${totals.referenced} 个`);
console.log(`孤儿文件 ${orphans.length} 个，占用 ${mb(totalSize)}\n`);

if (orphans.length === 0) {
  console.log('没有需要清理的文件。\n');
  process.exit(0);
}

const temp = orphans.filter((o) => /\/temp_/.test(o.name));
console.log(`  其中 temp_ 前缀（表单未提交）: ${temp.length} 个`);
console.log(`  其中正常命名（车辆已删除）  : ${orphans.length - temp.length} 个\n`);

orphans.slice(0, 15).forEach((o) => console.log(`  - ${o.name}  (${mb(o.size)})`));
if (orphans.length > 15) console.log(`  ... 另有 ${orphans.length - 15} 个`);

if (!DELETE) {
  console.log('\n(dry run — 加 --delete 才会真正删除)\n');
  process.exit(0);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let deleted = 0;
for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100).map((o) => o.name);
  const { error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) {
    console.error(`  删除失败 (${i}-${i + batch.length}):`, error.message);
  } else {
    deleted += batch.length;
    console.log(`  已删除 ${deleted}/${orphans.length}`);
  }
}
console.log(`\n完成，共删除 ${deleted} 个文件，释放约 ${mb(totalSize)}。\n`);
