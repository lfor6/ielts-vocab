/* ==========================================================================
 * Supabase 云同步客户端（纯静态站跨设备同步答题记录）
 * --------------------------------------------------------------------------
 * 依赖：supabase-js（UMD，CDN 引入，暴露 window.supabase）
 * 设计：云端为“真相源”，localStorage 仅作离线缓存/兜底。
 *       - 答题页：每次提交同时写 localStorage（本地即时）与 Supabase（异步、失败静默）
 *       - 管理端：优先读 Supabase；拉取失败则回退 localStorage，保证离线可用
 * ========================================================================== */
(function () {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  const log = (level, msg, extra) =>
    console[level] ? console[level]('[supabase-sync]', msg, extra || '') : null;

  // 稳定的每浏览器设备标识（用于排查/未来按设备隔离）
  function deviceId() {
    const K = 'ielts_device_id';
    let id = localStorage.getItem(K);
    if (!id) {
      id = 'd_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem(K, id); } catch (e) { /* ignore */ }
    }
    return id;
  }

  let _client = null;
  let _ready = false;

  function isOn() {
    return !!(cfg.ENABLED && cfg.URL && cfg.URL.indexOf('YOUR_') !== 0 &&
      cfg.ANON_KEY && cfg.ANON_KEY.indexOf('YOUR_') !== 0);
  }

  function init() {
    if (_ready) return _client;
    _ready = true;
    if (!isOn()) { log('info', '未启用（ENABLED=false 或配置为占位符），跳过云端初始化'); return null; }
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      log('warn', 'supabase-js 未加载（CDN 可能被网络拦截），仅用本地存储');
      return null;
    }
    try {
      _client = window.supabase.createClient(cfg.URL, cfg.ANON_KEY, {
        auth: { persistSession: false }, // 个人工具无需登录态
      });
      log('info', 'Supabase 客户端已初始化，云端同步开启');
    } catch (e) {
      log('error', 'Supabase 初始化失败', e);
      _client = null;
    }
    return _client;
  }

  // 单条写入（答题页调用，fire-and-forget，离线容错）
  function pushAnswer(rec) {
    const client = init();
    if (!client) return Promise.resolve(false);
    const row = {
      word_id: rec.word_id,
      selected_option: rec.selected_option,
      is_correct: rec.is_correct,
      response_time_ms: rec.response_time_ms || null,
      timestamp: rec.timestamp,
      device: deviceId(),
    };
    return client.from(cfg.TABLE).insert(row)
      .then(() => { log('debug', '已同步一条答题记录', row.word_id); return true; })
      .catch((e) => { log('warn', '云端写入失败（已保留本地）', e.message); return false; });
  }

  // 批量写入（管理端“同步本地到云端”调用）
  function pushMany(recs) {
    const client = init();
    if (!client || !recs.length) return Promise.resolve(0);
    const rows = recs.map((r) => ({
      word_id: r.word_id,
      selected_option: r.selected_option,
      is_correct: r.is_correct,
      response_time_ms: r.response_time_ms || null,
      timestamp: r.timestamp,
      device: deviceId(),
    }));
    return client.from(cfg.TABLE).insert(rows)
      .then(() => { log('info', '批量同步完成', rows.length); return rows.length; })
      .catch((e) => { log('error', '批量同步失败', e.message); throw e; });
  }

  // 拉取全部云端记录（管理端调用）
  function pullAnswers() {
    const client = init();
    if (!client) return Promise.resolve(null); // null = 不可用，调用方回退本地
    return client.from(cfg.TABLE).select('*')
      .then((res) => {
        if (res.error) throw res.error;
        const out = (res.data || []).map((r) => ({
          word_id: r.word_id,
          selected_option: r.selected_option,
          is_correct: r.is_correct,
          response_time_ms: r.response_time_ms,
          timestamp: r.timestamp,
        }));
        log('info', '从云端拉取记录', out.length);
        return out;
      })
      .catch((e) => { log('warn', '云端拉取失败，回退本地', e.message); return null; });
  }

  // 掌握度 upsert（复习调度管家；按 word_id 唯一，云端合并）
  function pushMastery(rec) {
    const client = init();
    if (!client) return Promise.resolve(false);
    const row = {
      word_id: rec.word_id,
      level: rec.level,
      ease: rec.ease,
      interval_days: rec.interval_days,
      due_at: rec.due_at,
      last_reviewed: rec.last_reviewed || null,
      review_count: rec.review_count || 0,
      correct_streak: rec.correct_streak || 0,
      wrong_streak: rec.wrong_streak || 0,
      updated_at: new Date().toISOString(),
      device: deviceId(),
    };
    return client.from('mastery').upsert(row, { onConflict: 'word_id' })
      .then(() => { log('debug', '已同步掌握度', row.word_id); return true; })
      .catch((e) => { log('warn', '云端写入掌握度失败（已留本地）', e.message); return false; });
  }

  // 拉取全部云端掌握度（返回 { word_id: {...} }）
  function pullMastery() {
    const client = init();
    if (!client) return Promise.resolve(null);
    return client.from('mastery').select('*')
      .then((res) => {
        if (res.error) throw res.error;
        const out = {};
        for (const r of (res.data || [])) {
          out[r.word_id] = {
            word_id: r.word_id, level: r.level, ease: r.ease,
            interval_days: r.interval_days, due_at: r.due_at,
            last_reviewed: r.last_reviewed, review_count: r.review_count,
            correct_streak: r.correct_streak, wrong_streak: r.wrong_streak,
          };
        }
        log('info', '从云端拉取掌握度', Object.keys(out).length);
        return out;
      })
      .catch((e) => { log('warn', '云端拉取掌握度失败，回退本地', e.message); return null; });
  }

  // 错题本 upsert（按 word_id 唯一，云端合并；答题页 recordWrong 调用）
  function pushWrong(entry) {
    const client = init();
    if (!client || !entry) return Promise.resolve(false);
    const row = {
      word_id: String(entry.word_id),
      word: entry.word || '',
      phonetic: entry.phonetic || '',
      correct_option: entry.correct_option || '',
      cet_level: entry.cet_level || '',
      last_wrong_option: (entry.last_wrong_option === null || entry.last_wrong_option === undefined)
        ? null : String(entry.last_wrong_option),
      wrong_count: entry.wrong_count || 1,
      first_ts: entry.first_ts || new Date().toISOString(),
      last_ts: entry.last_ts || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      device: deviceId(),
    };
    return client.from('wrong_book').upsert(row, { onConflict: 'word_id' })
      .then(() => { log('debug', '已同步错题本', row.word_id); return true; })
      .catch((e) => { log('warn', '云端写入错题本失败（已留本地）', e.message); return false; });
  }

  // 拉取全部云端错题本（返回 { word_id: {...} }）
  function pullWrong() {
    const client = init();
    if (!client) return Promise.resolve(null);
    return client.from('wrong_book').select('*')
      .then((res) => {
        if (res.error) throw res.error;
        const out = {};
        for (const r of (res.data || [])) {
          out[r.word_id] = {
            word_id: r.word_id, word: r.word, phonetic: r.phonetic,
            correct_option: r.correct_option, cet_level: r.cet_level,
            last_wrong_option: r.last_wrong_option, wrong_count: r.wrong_count,
            first_ts: r.first_ts, last_ts: r.last_ts,
          };
        }
        log('info', '从云端拉取错题本', Object.keys(out).length);
        return out;
      })
      .catch((e) => { log('warn', '云端拉取错题本失败，回退本地', e.message); return null; });
  }

  // 删除云端某条错题（管理端/答题页「移出」调用）
  function deleteWrong(wordId) {
    const client = init();
    if (!client) return Promise.resolve(false);
    return client.from('wrong_book').delete().eq('word_id', String(wordId))
      .then(() => { log('debug', '已删除云端错题', wordId); return true; })
      .catch((e) => { log('warn', '云端删除错题失败', e.message); return false; });
  }

  window.SupabaseSync = { isOn, init, pushAnswer, pushMany, pullAnswers, pushMastery, pullMastery, pushWrong, pullWrong, deleteWrong, deviceId };
})();
