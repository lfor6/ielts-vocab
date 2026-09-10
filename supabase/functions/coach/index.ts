// ============================================================================
// 雅思词汇智能陪练 · AI 讲解 Edge Function（可插拔增强）
// ----------------------------------------------------------------------------
// 作用：给定单词，调用可配置 LLM 生成「雅思语境例句 + 记忆法 + 选择题解析」。
// 密钥不落前端：LLM_API_KEY / LLM_MODEL / LLM_BASE_URL 以 Supabase Secrets 注入。
// 部署：
//   supabase functions deploy coach
//   supabase secrets set LLM_API_KEY=sk-xxx LLM_MODEL=deepseek-chat \
//     LLM_BASE_URL=https://api.deepseek.com/v1
// 前端调用（部署且设好 Secret 后启用）：
//   POST https://<PROJECT_REF>.functions.supabase.co/coach
//   Header: apikey: <anon key>   Body: { word, phonetic, correct_option, options }
// 不给 key 时本函数不启用，前端不调用，不影响现有 MVP 功能。
// ============================================================================
import { corsHeaders } from '../_shared/cors.ts';

const LLM_BASE_URL = Deno.env.get('LLM_BASE_URL') || 'https://api.deepseek.com/v1';
const LLM_API_KEY = Deno.env.get('LLM_API_KEY') || '';
const LLM_MODEL = Deno.env.get('LLM_MODEL') || 'deepseek-chat';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const { word, phonetic, correct_option, options } = body;
    if (!word) {
      return new Response(JSON.stringify({ error: 'word required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!LLM_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LLM not configured (LLM_API_KEY missing)' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const correctText =
      options && correct_option ? options[correct_option] : '';
    const prompt =
      `你是雅思词汇智能陪练。请用中文讲解单词 "${word}"` +
      (phonetic ? `（音标 ${phonetic}）` : '') +
      `，输出严格的 JSON（不要 markdown 代码块），结构如下：
{
  "example": "一个雅思学术/生活语境的英文例句（含中文释义）",
  "mnemonic": "一个记忆法（优先词根词缀拆解，其次联想/谐音）",
  "tip": "针对正确答案 ${correct_option}（${correctText}）的简要辨析与易混点提示"
}`;

    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(
        JSON.stringify({ error: 'LLM request failed', detail: txt }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await resp.json();
    let content = data?.choices?.[0]?.message?.content || '{}';
    let result: unknown;
    try {
      result = JSON.parse(content);
    } catch {
      result = { raw: content };
    }
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
