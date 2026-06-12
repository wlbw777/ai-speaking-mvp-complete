import { rateLimit } from "@/lib/ratelimit";

import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supportedLanguages = new Set(["ja", "en", "ko", "es"]);

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY，請先設定 .env.local 或部署環境變數。");
  return new OpenAI({ apiKey });
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
    const formData = await req.formData();
    const audio = formData.get("audio");
    const language = String(formData.get("language") || "ja");

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "沒有收到音檔" }, { status: 400 });
    }

    if (audio.size < 500) {
      return NextResponse.json({ error: "音檔太短，請錄 2 秒以上再送出" }, { status: 400 });
    }

    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      language: supportedLanguages.has(language) ? language : "ja"
    });

    return NextResponse.json({ text: transcription.text || "" });
  } catch (error) {
    console.error("speech error:", error);
    return NextResponse.json(
      {
        error: "語音辨識失敗",
        detail: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
