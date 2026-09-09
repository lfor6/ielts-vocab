/* ==========================================================================
 * Supabase 云同步配置（跨设备/跨打开方式数据一致）
 * --------------------------------------------------------------------------
 * 1) 到 https://supabase.com 免费建一个项目（Region 选离你近的，如 Singapore）
 * 2) 项目后台 → Settings → API，复制：
 *      - Project URL        → 填到下面的 URL
 *      - anon public key    → 填到下面的 ANON_KEY
 * 3) 在 SQL Editor 执行本目录 supabase-schema.sql 建表 + 放行 RLS
 * 4) 把 ENABLED 改为 true，重新推送上线即可生效
 *
 * ⚠️ 安全说明：anon key 是“公开可嵌入”的客户端密钥，本就设计成可放前端；
 *    真正的权限由 RLS 策略控制。本项目为个人背单词工具，schema.sql 中
 *    RLS 对 anon 放行全表操作（个人数据，可接受）。若日后多人共用，
 *    应改用 Supabase Auth（匿名登录）按 user_id 隔离数据。
 * ========================================================================== */
window.SUPABASE_CONFIG = {
  URL: 'YOUR_SUPABASE_URL',            // ← 替换为你的 Project URL
  ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',  // ← 替换为你的 anon public key
  ENABLED: false,                      // ← 填入真实 URL/key 后改为 true
  TABLE: 'answers',                    // 云端答题记录表名（与 schema.sql 一致）
};
