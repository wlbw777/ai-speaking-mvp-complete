
import { rateLimit } from "@/lib/ratelimit";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lang = "ja" | "en" | "ko" | "es";

const languageName: Record<Lang, string> = {
  ja: "日文",
  en: "英文",
  ko: "韓文",
  es: "西班牙文"
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY，請先設定 .env.local 或部署環境變數。");
  return new OpenAI({ apiKey });
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 500) : fallback;
}

export async function POST(req: NextRequest) {
  try {

    const ip =
  req.headers.get("x-forwarded-for") ||
  "unknown";

if (!rateLimit(ip, 10)) {
  return NextResponse.json(
    {
      error: "請稍後再試"
    },
    { status: 429 }
  );
}
    const body = await req.json();
    const targetText = safeText(body.targetText);
    const transcript = safeText(body.transcript);
    const language = safeText(body.language, "ja") as Lang;

    if (!targetText || !transcript) {
      return NextResponse.json({ error: "缺少 targetText 或 transcript" }, { status: 400 });
    }

    const prompt = `
你是一位專業外語發音老師，學生多為初學者。
請根據「目標句」與「語音辨識結果」評估學生是否唸得接近。

學習語言：${languageName[language] || language || "外語"}
目標句：${targetText}
學生辨識結果：${transcript}

評分標準：
1. 發音接近度
2. 音節完整度
3. 語調自然度
4. 初學者可理解程度

請只回傳 JSON，不要加 Markdown：
{
  "score": 0-100,
  "level": "excellent | good | needs_practice",
  "feedback": "一句鼓勵回饋，繁體中文",
  "suggestion": "一個具體修正建議，繁體中文"
}
`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "你是語言學習平台的 AI 發音評分老師。請用繁體中文回覆，且只輸出合法 JSON。"
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);
    const score = Math.max(0, Math.min(100, Number(result.score) || 0));

    return NextResponse.json({
      score,
      level: result.level || "needs_practice",
      feedback: result.feedback || "完成練習，繼續保持！",
      suggestion: result.suggestion || "請放慢速度，讓每個音節更清楚。"
    });
  } catch (error) {
    console.error("feedback error:", error);
    return NextResponse.json(
      {
        error: "AI 評分失敗",
        detail: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}