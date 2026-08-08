# Vantage Parking System — Deployment Guide

## 部署步骤（约需 30–60 分钟，全程免费）

---

## Step 1：创建 Supabase 数据库（免费）

1. 访问 https://supabase.com，注册账号（GitHub 登录即可）
2. 点击 "New project"，填写项目名称和数据库密码（**保存好这个密码**）
3. 选择距离你最近的服务器（推荐 West US）
4. 项目创建完成后，进入左侧菜单 **SQL Editor**
5. 复制 `supabase/schema.sql` 文件的全部内容，粘贴到 SQL Editor 中，点击 **Run**
6. 进入左侧菜单 **Storage** → 创建两个 Bucket：
   - `registration-docs`（设为 Public）
   - `violation-photos`（设为 Public）
7. 进入 **Settings → API**，复制以下三个值：
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role secret → `SUPABASE_SERVICE_ROLE_KEY`（点击 reveal 查看）

---

## Step 2：配置 Resend 邮件服务（免费，3000封/月）

1. 访问 https://resend.com，注册账号
2. 进入 **API Keys** → Create API Key → 复制 Key → `RESEND_API_KEY`
3. 进入 **Domains** → Add Domain → 输入你的社区域名（如 `vtgcommunity.com`）
4. 按提示在域名 DNS 设置中添加 MX/TXT 记录（约 5 分钟生效）
5. 验证通过后，发件地址设为：`parking@你的域名.com` → `EMAIL_FROM`

> 如果暂时没有自己的域名，Resend 提供 `onboarding@resend.dev` 测试地址

---

## Step 3：部署到 Vercel（免费）

1. 访问 https://vercel.com，用 GitHub 账号注册
2. 将本项目代码上传到 GitHub（New repository → upload files）
3. 在 Vercel 点击 **Add New Project** → 选择你的 GitHub 仓库
4. 在 **Environment Variables** 中填入以下所有变量：

```
NEXT_PUBLIC_SUPABASE_URL        = （Step 1 复制的值）
NEXT_PUBLIC_SUPABASE_ANON_KEY   = （Step 1 复制的值）
SUPABASE_SERVICE_ROLE_KEY       = （Step 1 复制的值）
RESEND_API_KEY                  = （Step 2 复制的值）
EMAIL_FROM                      = parking@你的域名.com
NEXT_PUBLIC_APP_URL             = https://你的Vercel域名.vercel.app
SESSION_SECRET                  = （随意填写一个32位以上的随机字符串）
```

5. 点击 **Deploy** → 等待约 2 分钟完成部署

---

## Step 4：绑定自定义域名（可选）

1. 在 Vercel 项目 → **Settings → Domains** → 添加你的子域名
   - 推荐格式：`parking.vtgcommunity.com`
2. 在你的域名 DNS 管理处添加 CNAME 记录指向 Vercel
3. 等待 DNS 生效（5分钟到24小时）
4. 更新环境变量 `NEXT_PUBLIC_APP_URL` 为新域名，重新部署

---

## Step 5：初始设置

部署完成后，访问你的网站：

### 修改默认管理员密码
1. 进入 Supabase → Table Editor → `admin_users`
2. 找到 username = `admin` 的记录
3. 使用 Supabase SQL Editor 运行以下命令更新密码：
```sql
-- 将密码改为你自己设定的值（需要先生成 bcrypt hash）
-- 可在 https://bcrypt.online/ 生成，cost factor = 10
UPDATE admin_users 
SET password_hash = '你的bcrypt hash' 
WHERE username = 'admin';
```

### 添加通知邮件收件人
1. 用 admin 账号登录后台 `/admin/login`
2. 进入 **通知邮箱** 菜单，添加接收违章举报邮件的地址

### 导入门牌号
1. 准备一个 Excel 文件，包含两列：`unit_number`（门牌号）和 `address`（地址）
2. 进入管理后台 **门牌号管理** → 点击 **从 Excel 导入**

### 创建巡逻员账号
先为该账号生成一个**强随机密码**的 bcrypt hash，再在 Supabase SQL Editor 运行：
```sql
INSERT INTO admin_users (username, password_hash, role, display_name)
VALUES (
  'patrol01',
  '<在此填入你生成的 bcrypt hash>',
  'patrol',
  'Patrol Officer 1'
);
```

### 账号命名规则（新增账号时统一遵循）

- **用户名**：`角色_名首字母姓首字母`（全小写）。
  - 角色前缀：管理员用 `admin`，巡逻员用 `patrol`。
  - 后缀：本人「名的首字母 + 姓的首字母」。
  - 例：Jeana Franco → 管理员 `admin_jf`，巡逻员 `patrol_jf`。
- **初始密码**：为每个账号**单独生成一个强随机密码**（不要使用可预测的规则如"角色+日期"），通过安全渠道下发给账号所有者。
- **入库前先生成 bcrypt hash**（cost = 10），`password_hash` 存哈希、不存明文：
  ```bash
  node -e "require('bcryptjs').hash('<强随机密码>', 10).then(console.log)"
  ```
- 管理员记得带 `email` 字段（登录需邮箱 OTP 验证码）；巡逻员登录仅用户名+密码，`email` 可留空。
- ⚠️ 请提醒账号所有者**首次登录后立即改密**。

---

## 默认账号

系统初始种子会创建一个管理员账号（用户名 `admin`）。**其密码不写入本仓库**——请在部署时按上面「修改默认管理员密码」的步骤，立即设置一个**强随机密码**并存入共享密码库。

**⚠️ 首次登录后请立即修改密码！**

---

## 月度维护

- 访客停车额度每月自动重置（按 year_month 字段）
- Supabase 免费层每 7 天不活跃会暂停 → 只需每周登录一次后台即可保持活跃
- 建议每季度在 Supabase → Settings → Backups 导出一次数据库备份

---

## 费用说明

| 服务 | 当前用量 | 费用 |
|------|---------|------|
| Vercel | 静态+动态渲染 | 免费 |
| Supabase | < 100MB 数据 | 免费 |
| Cloudflare R2 / Supabase Storage | < 5GB 照片 | 免费 |
| Resend | < 3,000 封/月 | 免费 |
| **总计** | | **$0/月** |
