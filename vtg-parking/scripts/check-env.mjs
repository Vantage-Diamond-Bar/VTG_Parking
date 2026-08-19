/**
 * 自检 .env.local 里的凭据是否可用。
 *
 *   node scripts/check-env.mjs
 *
 * 只输出通过/失败和密钥格式，**绝不打印密钥内容**，可以放心把输出贴给别人。
 *
 * 背景：Supabase 于 2026-08-08 停用了 legacy API keys（anon / service_role），
 * 但停用范围不是全部接口——数据 API 和认证 API 立即生效，Storage 当时尚未强制。
 * 所以「Storage 能用」不代表密钥没问题，必须分接口测。
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('找不到 .env.local，请先在 vtg-parking/ 目录下运行本脚本。');
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

/** 只描述密钥的"形状"，不泄露内容。 */
function shape(v) {
  if (!v) return '(未设置)';
  if (v.startsWith('sb_publishable_')) return '新版 publishable key ✅';
  if (v.startsWith('sb_secret_')) return '新版 secret key ✅';
  if (v.startsWith('eyJ')) return '旧版 JWT key（legacy，已停用）⚠️';
  return `未知格式（前缀 ${v.slice(0, 3)}…，长度 ${v.length}）`;
}

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n── 密钥格式 ──────────────────────────────────');
console.log('NEXT_PUBLIC_SUPABASE_URL      ', URL_ || '(未设置)');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY ', shape(ANON));
console.log('SUPABASE_SERVICE_ROLE_KEY     ', shape(SECRET));

if (!URL_ || !ANON || !SECRET) {
  console.error('\n必需变量缺失，先补齐再测。');
  process.exit(1);
}

const hdr = (k) => ({ apikey: k, Authorization: `Bearer ${k}` });
let failed = 0;

async function probe(label, url, key, { expectOk = true } = {}) {
  let status, note = '';
  try {
    const r = await fetch(url, { headers: hdr(key) });
    status = r.status;
    if (!r.ok) {
      const body = await r.text();
      if (body.includes('Legacy API keys are disabled')) note = '← 旧版密钥已被停用';
      else note = body.slice(0, 70).replace(/\s+/g, ' ');
    }
  } catch (e) {
    status = 'ERR';
    note = e.message;
  }
  const ok = status === 200;
  if (expectOk && !ok) failed++;
  console.log(`${label.padEnd(34)} ${String(status).padEnd(5)} ${ok ? '✅' : '❌ ' + note}`);
}

console.log('\n── 接口连通性 ────────────────────────────────');
await probe('数据 API  (anon)', `${URL_}/rest/v1/units?select=id&limit=1`, ANON);
await probe('数据 API  (secret)', `${URL_}/rest/v1/units?select=id&limit=1`, SECRET);
await probe('存储 API  (secret)', `${URL_}/storage/v1/bucket`, SECRET);

console.log('\n── 其他凭据 ──────────────────────────────────');
console.log('RESEND_API_KEY   ', env.RESEND_API_KEY ? `已设置（前缀 ${env.RESEND_API_KEY.slice(0, 3)}…）` : '(未设置)');
console.log('SESSION_SECRET   ', env.SESSION_SECRET ? `已设置（长度 ${env.SESSION_SECRET.length}${env.SESSION_SECRET.length < 32 ? ' ⚠️ 建议≥32' : ''}）` : '(未设置)');
console.log('DATABASE_URL     ', env.DATABASE_URL ? '已设置' : '(未设置)');

// 本地开发指向哪个库，是最容易被忽略、后果又最重的一件事。
if (URL_.includes('uxqdodpvcdtnsygjslps')) {
  console.log(
    '\n⚠️  注意：本地开发指向的是**生产数据库**。' +
      '\n   在本地跑 npm run dev 时的任何提交、删除、审批都会直接写进真实数据。' +
      '\n   上线前建议单独建一个 Supabase 项目作为开发环境。'
  );
}

console.log(failed === 0 ? '\n结果：全部通过 ✅\n' : `\n结果：${failed} 项失败 ❌\n`);
process.exit(failed === 0 ? 0 : 1);
