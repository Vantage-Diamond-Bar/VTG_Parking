/**
 * 正式上线前清空 Supabase Storage 中的测试文件。
 *
 *   node scripts/clear-storage.mjs            # 只列出，不删除（dry run）
 *   node scripts/clear-storage.mjs --delete   # 真正删除
 *
 * 需要 .env.local 里的 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。
 * registration-docs 已是 Private，violation-photos 维持 Public（见 CONTEXT.md）。
 * 本脚本用 service_role 直连，两者都能列出和删除。删除前请确认没有需要留档的真实文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DELETE = process.argv.includes('--delete');
const BUCKETS = ['registration-docs', 'violation-photos'];

// Fail fast with something actionable. Supabase disabled the legacy anon /
// service_role keys on 2026-08-08, so a .env.local that predates that gets a
// bare 401 from every call — easy to misread as a permissions problem.
async function preflight() {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (res.ok) return;

  const body = await res.text();
  console.error(`\n无法访问 Storage（HTTP ${res.status}）。`);
  if (body.includes('Legacy API keys are disabled')) {
    console.error(
      '\n原因：.env.local 里的是 legacy service_role key。Supabase 于 2026-08-08' +
        '停用了旧密钥体系——数据 API(/rest/v1) 和认证 API 当时即刻生效，Storage 当时' +
        '尚未强制；看到这条说明 Storage 也开始强制了。' +
        '\n解决：到 Supabase → Settings → API Keys 取新版 secret key，' +
        '更新 .env.local 的 SUPABASE_SERVICE_ROLE_KEY 后重跑。'
    );
  } else {
    console.error(body.slice(0, 300));
  }
  process.exit(1);
}

await preflight();

/** registration-docs 是 `${unit_id}/文件名`，violation-photos 是平铺的，所以要递归一层。 */
async function listAll(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    if (!data.length) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(bucket, full))); // 目录
      else out.push(full);
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

for (const bucket of BUCKETS) {
  const files = await listAll(bucket);
  console.log(`\n[${bucket}] ${files.length} 个文件`);
  files.slice(0, 20).forEach((f) => console.log('  -', f));
  if (files.length > 20) console.log(`  ... 另有 ${files.length - 20} 个`);

  if (!files.length) continue;
  if (!DELETE) {
    console.log('  (dry run — 加 --delete 才会真正删除)');
    continue;
  }
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) console.error('  删除失败:', error.message);
    else console.log(`  已删除 ${batch.length} 个`);
  }
}
console.log('\n完成。');
