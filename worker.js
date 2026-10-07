const MODEL = "gpt-5.6-luna";

const questionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    understanding: { type: "string" },
    category: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    reason_for_questions: { type: "string" },
    site_checks_preview: { type: "array", items: { type: "string" } }
  },
  required: ["understanding", "category", "questions", "reason_for_questions", "site_checks_preview"]
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    understanding: { type: "string" },
    category: { type: "string" },
    confidence: { type: "string", enum: ["高", "中", "低"] },
    site_checks: { type: "array", items: { type: "string" } },
    market: {
      type: "object", additionalProperties: false,
      properties: {
        range: { type: "string" },
        basis: { type: "string" },
        regional_fit: { type: "string" },
        cautions: { type: "array", items: { type: "string" } }
      },
      required: ["range", "basis", "regional_fit", "cautions"]
    },
    estimate: {
      type: "object", additionalProperties: false,
      properties: {
        range: { type: "string" },
        breakdown: { type: "array", items: { type: "string" } },
        pricing_logic: { type: "string" }
      },
      required: ["range", "breakdown", "pricing_logic"]
    },
    additional_proposals: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          proposal: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["高", "中", "低"] }
        },
        required: ["proposal", "reason", "priority"]
      }
    },
    talk: { type: "string" },
    next_step: { type: "string" },
    safety: { type: "array", items: { type: "string" } },
    sources: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          note: { type: "string" }
        },
        required: ["title", "url", "note"]
      }
    }
  },
  required: ["understanding", "category", "confidence", "site_checks", "market", "estimate", "additional_proposals", "talk", "next_step", "safety", "sources"]
};

const baseInstructions = `
あなたは「便利屋 売上ナビ」の案件理解・売上支援エンジンです。
便利屋の案件は非常に多岐にわたります。固定リストに当てはめて処理してはいけません。
ユーザーが書いた依頼文を最重要情報として、意味を正確に理解してください。

絶対ルール:
- 「コンセント増設」を剪定など別案件に取り違えない。
- 初めて見る作業でも、依頼文の意味から必要な確認事項を考える。
- 案件に不要な質問は出さない。
- 数量・高さなど特定作業の項目を全案件共通で出さない。
- 写真は最大5枚。写真で見える事実だけを根拠にし、不明点は現地確認にする。
- 地域は登録された都道府県を使う。
- 市場相場を示す場合はWeb検索で現在公開されている料金情報を調べる。
- 地域情報が不足する場合は「周辺地域を含む参考」「全国参考」などと明示する。
- 根拠のない金額は作らない。
- 追加提案は今回の案件と関連性があり、お客様にも合理的なものだけ。無理なアップセルをしない。
- 電気、ガス、水道、屋根、高所、構造等は資格・安全面を確認する。
- 10万円・20万円・30万円の固定プランは使わない。
- JSONのみを返す。
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function safeError(e, fallback) {
  return {
    error: fallback,
    detail: {
      status: e?.status ?? null,
      code: e?.code ?? null,
      type: e?.type ?? null,
      message: String(e?.message ?? e).slice(0, 500)
    }
  };
}

async function callOpenAI(env, body) {
  if (!env.OPENAI_API_KEY) throw Object.assign(new Error("OPENAI_API_KEYがCloudflare Workerに設定されていません。"), { status: 500, code: "missing_api_key" });
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI API HTTP ${r.status}`;
    throw Object.assign(new Error(msg), {
      status: r.status,
      code: data?.error?.code,
      type: data?.error?.type
    });
  }
  return data;
}

function outputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of (data?.output || [])) {
    for (const c of (item?.content || [])) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

function inputContent(job, prefecture, place, answers, images) {
  const content = [{
    type: "input_text",
    text: `営業エリア：${prefecture}\n作業場所：${place}\n依頼内容：${job}\n追加回答：${answers?.join("\n") || "なし"}\n写真：${images.length}枚`
  }];
  for (const im of images.slice(0, 5)) {
    if (im?.data && im?.mimeType) {
      content.push({ type: "input_image", image_url: `data:${im.mimeType};base64,${im.data}` });
    }
  }
  return content;
}

async function questions(request, env) {
  const b = await request.json().catch(() => ({}));
  const job = String(b.job || "").trim();
  const prefecture = String(b.prefecture || "").trim();
  const place = String(b.place || "").trim();
  const images = Array.isArray(b.images) ? b.images.slice(0, 5) : [];
  if (!job) return json({ error: "案件内容を入力してください。" }, 400);

  try {
    const data = await callOpenAI(env, {
      model: env.OPENAI_MODEL || MODEL,
      instructions: baseInstructions + `\nこの段階では「案件理解」と「必要な追加質問」のみを行います。質問は0〜6個。すでに依頼文から分かることは聞かない。`,
      input: [{ role: "user", content: inputContent(job, prefecture, place, [], images) }],
      text: { format: { type: "json_schema", name: "job_questions", strict: true, schema: questionsSchema } },
      store: false
    });
    return json(JSON.parse(outputText(data)));
  } catch (e) {
    return json(safeError(e, "案件理解に失敗しました。"), 500);
  }
}

async function analyze(request, env) {
  const b = await request.json().catch(() => ({}));
  const job = String(b.job || "").trim();
  const prefecture = String(b.prefecture || "").trim();
  const place = String(b.place || "").trim();
  const answers = Array.isArray(b.answers) ? b.answers : [];
  const images = Array.isArray(b.images) ? b.images.slice(0, 5) : [];
  if (!job) return json({ error: "案件内容を入力してください。" }, 400);

  try {
    const data = await callOpenAI(env, {
      model: env.OPENAI_MODEL || MODEL,
      instructions: baseInstructions + `\n追加回答を含めて案件を最終分析してください。市場相場はWeb検索を使い、登録都道府県を最優先。検索結果が十分でない場合、無理に金額を作らず「相場情報不足」とすること。見積レンジは市場相場と同一ではなく、今回条件から考えた概算であることを明記。出典URLは検索で実際に確認したものだけ。`,
      tools: [{ type: "web_search" }],
      input: [{ role: "user", content: inputContent(job, prefecture, place, answers, images) }],
      text: { format: { type: "json_schema", name: "sales_navi_analysis", strict: true, schema: analysisSchema } },
      store: false
    });
    return json(JSON.parse(outputText(data)));
  } catch (e) {
    return json(safeError(e, "分析に失敗しました。"), 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/questions" && request.method === "POST") return questions(request, env);
    if (url.pathname === "/api/analyze" && request.method === "POST") return analyze(request, env);
    if (url.pathname === "/api/health") {
      return json({ ok: true, openaiKeyConfigured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL || MODEL });
    }
    return env.ASSETS.fetch(request);
  }
};
