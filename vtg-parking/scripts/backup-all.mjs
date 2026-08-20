/**
 * 完整备份：所有数据库表 + 所有存储桶文件，导出到本地目录。
 *
 *   node scripts/backup-all.mjs                 # 输出到仓库外的默认目录
 *   node scripts/backup-all.mjs --out D:\\bak    # 指定目录
 *
 * 输出内容：
 *   database/<表名>.json   完整行数据（可编程恢复）
 *   database/<表名>.csv    同样内容，可直接用 Excel 打开
 *   database/schema.json   每张表的列定义
 *   storage/<桶名>/...     原样保留路径的文件
 *   manifest.json          行数、文件数、字节数——用于核对备份完整性
 *   RESTORE.md             恢复说明
 *
 * ⚠️ 备份内含住户姓名、电话、邮箱和行驶证扫描件（PII）。
 *    默认输出到 git 仓库之外，切勿提交进版本库——本仓库是公开的。
 *
 * 数据库走 DATABASE_URL 直连（pg_dump 未安装），存储走 service_role。
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

const stamp = new Date().toISOString().slice(0, 10);
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx !== -1 && process.argv[outIdx + 1]
  ? path.resolve(process.argv[outIdx + 1])
  : path.resolve(process.cwd(), '..', '..', `VTG_Parking_backup_${stamp}`);

// 防呆：备份含 PII，绝不能落进 git 仓库
for (let d = OUT; ; ) {
  if (fs.existsSync(path.join(d, '.git'))) {
    console.error(`\n拒绝写入：${OUT} 位于 git 仓库 ${d} 内部。`);
    console.error('备份含住户 PII，本仓库是公开的。请用 --out 指定仓库之外的目录。\n');
    process.exit(1);
  }
  const parent = path.dirname(d);
  if (parent === d) break;
  d = parent;
}

fs.mkdirSync(path.join(OUT, 'database'), { recursive: true });
console.log(`\n输出目录: ${OUT}\n`);

const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const manifest = { created_at: new Date().toISOString(), database: {}, storage: {} };

function toCsv(rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

// ── 数据库 ────────────────────────────────────────────────────────────────────
const { rows: tables } = await db.query(`
  select table_schema, table_name
    from information_schema.tables
   where table_schema in ('public', 'pre_launch_archive')
     and table_type = 'BASE TABLE'
   order by table_schema, table_name
`);

const schema = {};
for (const { table_schema, table_name } of tables) {
  const label = table_schema === 'public' ? table_name : `${table_schema}.${table_name}`;
  const { rows } = await db.query(
    `select * from "${table_schema}"."${table_name}"`
  );
  const base = path.join(OUT, 'database', label);
  fs.writeFileSync(`${base}.json`, JSON.stringify(rows, null, 2), 'utf8');
  fs.writeFileSync(`${base}.csv`, toCsv(rows), 'utf8');

  const { rows: cols } = await db.query(`
    select column_name, data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position
  `, [table_schema, table_name]);
  schema[label] = cols;

  manifest.database[label] = rows.length;
  console.log(`  ${label.padEnd(38)} ${String(rows.length).padStart(5)} 行`);
}
fs.writeFileSync(path.join(OUT, 'database', 'schema.json'), JSON.stringify(schema, null, 2), 'utf8');

// ── 存储 ──────────────────────────────────────────────────────────────────────
const { rows: objects } = await db.query(`
  select bucket_id, name, coalesce((metadata->>'size')::bigint, 0) as size
    from storage.objects order by bucket_id, name
`);
await db.end();

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('');
let okCount = 0;
const failures = [];
for (const o of objects) {
  const dest = path.join(OUT, 'storage', o.bucket_id, o.name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const { data, error } = await supabase.storage.from(o.bucket_id).download(o.name);
  if (error || !data) {
    failures.push(`${o.bucket_id}/${o.name}: ${error?.message ?? 'empty'}`);
    continue;
  }
  fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
  okCount++;
  if (okCount % 20 === 0) console.log(`  已下载 ${okCount}/${objects.length} 个文件`);
}

for (const b of [...new Set(objects.map((o) => o.bucket_id))]) {
  const inBucket = objects.filter((o) => o.bucket_id === b);
  manifest.storage[b] = {
    expected: inBucket.length,
    bytes: inBucket.reduce((s, o) => s + Number(o.size), 0),
  };
}
manifest.storage_downloaded = okCount;
manifest.storage_failed = failures;

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

fs.writeFileSync(path.join(OUT, 'RESTORE.md'), `# VTG Parking 数据备份

生成时间：${manifest.created_at}

## 内容

- \`database/*.json\` — 每张表的完整行数据，字段名与数据库一致
- \`database/*.csv\`  — 同样内容，可用 Excel 打开查看
- \`database/schema.json\` — 每张表的列定义（类型、可空、默认值）
- \`storage/<桶名>/...\` — 存储桶文件，目录结构与桶内路径一致
- \`manifest.json\` — 行数与文件数，用于核对备份是否完整

## ⚠️ 这份备份含个人信息

住户姓名、电话、邮箱、车牌，以及 \`storage/registration-docs/\` 下的行驶证扫描件。

**不要提交进 git 仓库**（VTG_Parking 是公开仓库），不要放进公开网盘共享链接。

## 如何恢复

数据库表按依赖顺序恢复：先 \`units\`（其他表通过 unit_id 外键引用它），
再 \`resident_vehicles\` / \`visitor_registrations\` / \`vacation_parking_requests\`，
其余表无依赖，顺序随意。

用 JSON 逐表写回即可，例如：

\`\`\`js
const rows = JSON.parse(fs.readFileSync('database/units.json', 'utf8'));
for (const r of rows) await supabaseAdmin.from('units').insert(r);
\`\`\`

存储文件按原路径上传回对应的桶，路径必须与
\`resident_vehicles.registration_doc_path\` 中记录的一致，否则住户端点「查看文件」会失效。
`, 'utf8');

console.log(`\n数据库：${Object.keys(manifest.database).length} 张表`);
console.log(`存储  ：${okCount}/${objects.length} 个文件`);
if (failures.length) {
  console.log(`\n⚠️ ${failures.length} 个文件下载失败：`);
  failures.slice(0, 10).forEach((f) => console.log('   ', f));
  process.exitCode = 1;
} else {
  console.log('\n✅ 备份完成，无失败项。');
}
console.log(`\n位置: ${OUT}\n`);
