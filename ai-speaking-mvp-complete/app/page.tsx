"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Lang = "ja" | "en" | "ko" | "es";
type Card = { text: string; romaji: string; meaning: string };
type LogItem = { text: string; score: number; time: string };
type FeedbackResult = { score: number; level: string; feedback: string; suggestion: string };

const totalSeconds = 10 * 60;

const cardSets: Record<Lang, Card[]> = {
  ja: [
    { text: "こんにちは", romaji: "konnichiwa", meaning: "意思：你好。請自然、清楚地唸出來。" },
    { text: "ありがとう", romaji: "arigatou", meaning: "意思：謝謝。注意長音 ou 的尾音。" },
    { text: "すみません", romaji: "sumimasen", meaning: "意思：不好意思 / 對不起。適合日常情境。" },
    { text: "おはよう", romaji: "ohayou", meaning: "意思：早安。注意 ha 與 you 的連接。" },
    { text: "お願いします", romaji: "onegaishimasu", meaning: "意思：麻煩你 / 請多指教。" }
  ],
  en: [
    { text: "Hello", romaji: "heh-low", meaning: "意思：你好。注意 H 開頭氣音。" },
    { text: "Thank you", romaji: "thank you", meaning: "意思：謝謝。注意 th 的咬舌音。" },
    { text: "Excuse me", romaji: "ik-skyooz mee", meaning: "意思：不好意思 / 借過。" },
    { text: "Good morning", romaji: "good mor-ning", meaning: "意思：早安。語尾不要太重。" },
    { text: "Nice to meet you", romaji: "nice to meet you", meaning: "意思：很高興認識你。" }
  ],
  ko: [
    { text: "안녕하세요", romaji: "annyeonghaseyo", meaning: "意思：你好。注意連音自然。" },
    { text: "감사합니다", romaji: "gamsahamnida", meaning: "意思：謝謝。尾音 nida 要收乾淨。" },
    { text: "죄송합니다", romaji: "joesonghamnida", meaning: "意思：對不起。" },
    { text: "좋은 아침이에요", romaji: "joeun achimieyo", meaning: "意思：早安。" },
    { text: "부탁합니다", romaji: "butakamnida", meaning: "意思：拜託 / 麻煩你。" }
  ],
  es: [
    { text: "Hola", romaji: "o-la", meaning: "意思：你好。H 不發音。" },
    { text: "Gracias", romaji: "gra-syas", meaning: "意思：謝謝。注意 r 與 cias。" },
    { text: "Perdón", romaji: "per-don", meaning: "意思：不好意思 / 抱歉。" },
    { text: "Buenos días", romaji: "bwe-nos di-as", meaning: "意思：早安。" },
    { text: "Mucho gusto", romaji: "mu-cho gus-to", meaning: "意思：很高興認識你。" }
  ]
};

function formatTime(seconds: number) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function isLocalhost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function filenameFromMime(mime: string) {
  if (mime.includes("mp4")) return "recording.mp4";
  if (mime.includes("aac")) return "recording.aac";
  return "recording.webm";
}

export default function Home() {
  const [language, setLanguage] = useState<Lang>("ja");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("尚未開始");
  const [score, setScore] = useState<number | null>(null);
  const [feedbackTitle, setFeedbackTitle] = useState("等待練習");
  const [feedbackText, setFeedbackText] = useState("點擊「開始錄音」後，系統會錄音、辨識，並提供 AI 評分與修正方向。");
  const [transcript, setTranscript] = useState("");
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [notice, setNotice] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");

  const cards = cardSets[language];
  const card = cards[currentIndex] || cards[0];
  const progress = Math.min(100, ((totalSeconds - remainingSeconds) / totalSeconds) * 100);
  const scoreDegree = (score || 0) * 3.6;

  const summaryText = useMemo(() => {
    if (!logs.length) return "你尚未完成練習，可以重新開始體驗。";
    const avg = Math.round(logs.reduce((sum, item) => sum + item.score, 0) / logs.length);
    return `你完成了 ${logs.length} 次練習，平均分數 ${avg} 分。正式版可加入學生紀錄、老師後台與訂閱制。`;
  }, [logs]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setStarted(false);
          setStatus("已結束");
          setShowModal(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [started]);

  useEffect(() => {
    checkRecorderReady();
    return () => stopTracks();
  }, []);

  function resetScore(title = "等待練習", text = "點擊「開始錄音」後，系統會錄音、辨識，並提供 AI 評分與修正方向。") {
    setScore(null);
    setFeedbackTitle(title);
    setFeedbackText(text);
    setTranscript("");
  }

  function stopTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function checkRecorderReady() {
    if (typeof window === "undefined") return false;
    if (!window.isSecureContext && !isLocalhost()) {
      setStatus("需要 HTTPS");
      setFeedbackTitle("手機麥克風需要 HTTPS");
      setFeedbackText("請部署到 Vercel / Netlify 的 https 網址後再用手機測試。手機用 http://區網IP 通常無法開啟麥克風。");
      setNotice("手機測試請務必使用 HTTPS 網址，否則瀏覽器會擋麥克風。localhost 本機測試不受影響。");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("不支援錄音");
      setFeedbackTitle("此瀏覽器不支援錄音");
      setFeedbackText("請使用最新版 Chrome、Edge、Safari，並確認已允許麥克風權限。");
      return false;
    }
    if (typeof MediaRecorder === "undefined") {
      setStatus("不支援 MediaRecorder");
      setFeedbackTitle("此瀏覽器錄音格式不支援");
      setFeedbackText("請改用最新版 Chrome / Edge / Safari，或更新手機系統後再測試。");
      return false;
    }
    setNotice("");
    return true;
  }

  function startDemo() {
    if (started) return;
    setStarted(true);
    setStatus("體驗中");
  }

  function resetDemo() {
    stopTracks();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRemainingSeconds(totalSeconds);
    setStarted(false);
    setCurrentIndex(0);
    setLogs([]);
    setIsRecording(false);
    setIsAnalyzing(false);
    setStatus("尚未開始");
    setShowModal(false);
    resetScore();
    window.setTimeout(checkRecorderReady, 0);
  }

  function nextCard() {
    setCurrentIndex((prev) => (prev + 1) % cards.length);
    resetScore("換下一張字卡", "請先看字卡內容，再點擊錄音開始練習。");
  }

  async function speechToText(audioBlob: Blob, lang: Lang) {
    const formData = new FormData();
    formData.append("audio", audioBlob, filenameFromMime(audioBlob.type || mimeTypeRef.current));
    formData.append("language", lang);
    const res = await fetch("/api/speech", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({ error: "語音辨識回傳格式錯誤" }));
    if (!res.ok) throw new Error(data.detail || data.error || "語音辨識失敗");
    return data.text || "";
  }

  async function getAIFeedback(targetText: string, studentTranscript: string, lang: Lang): Promise<FeedbackResult> {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetText, transcript: studentTranscript, language: lang })
    });
    const data = await res.json().catch(() => ({ error: "AI 評分回傳格式錯誤" }));
    if (!res.ok) throw new Error(data.detail || data.error || "AI 評分失敗");
    return data;
  }

  async function analyzeSpeech(audioBlob: Blob) {
    if (!audioBlob || audioBlob.size < 500) throw new Error("錄音時間太短或沒有收到聲音，請錄 2 秒以上再停止。");
    setIsAnalyzing(true);
    setStatus("語音辨識中...");
    setFeedbackTitle("Whisper 辨識中");
    setFeedbackText("正在將錄音轉成文字，完成後會送出 AI 評分。");

    try {
      const studentTranscript = await speechToText(audioBlob, language);
      setTranscript(studentTranscript || "未辨識到明確文字");
      setStatus("AI 評分中...");
      const aiResult = await getAIFeedback(card.text, studentTranscript || "未辨識到明確文字", language);
      const safeScore = Math.max(0, Math.min(100, Number(aiResult.score) || 0));
      setScore(safeScore);
      setFeedbackTitle(aiResult.feedback || "完成評分");
      setFeedbackText(aiResult.suggestion || "請再練習一次，保持音量穩定並注意音節節奏。");
      setLogs((prev) => [
        { text: card.text, score: safeScore, time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) },
        ...prev
      ]);
      setStatus("分析完成");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleRecord() {
    if (isAnalyzing) return;
    if (!started) startDemo();
    if (!checkRecorderReady()) return;

    if (!isRecording) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        chunksRef.current = [];
        mimeTypeRef.current = pickMimeType();
        recorderRef.current = new MediaRecorder(streamRef.current, mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined);
        recorderRef.current.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorderRef.current.onerror = () => {
          setStatus("錄音失敗");
          setFeedbackTitle("錄音發生錯誤");
          setFeedbackText("請確認麥克風權限，或改用 Chrome / Edge / Safari 最新版。");
          stopTracks();
        };
        recorderRef.current.onstop = async () => {
          const blobType = mimeTypeRef.current || chunksRef.current[0]?.type || "audio/webm";
          const audioBlob = new Blob(chunksRef.current, { type: blobType });
          stopTracks();
          setIsRecording(false);
          setStatus("準備分析...");
          try {
            await analyzeSpeech(audioBlob);
          } catch (error) {
            const message = error instanceof Error ? error.message : "請確認 API 路由、OPENAI_API_KEY 與網路連線。";
            setStatus("分析失敗");
            setFeedbackTitle("分析失敗");
            setFeedbackText(message);
          }
        };
        recorderRef.current.start(250);
        setIsRecording(true);
        setStatus("錄音中...");
        resetScore("錄音中", "請清楚唸出目前字卡內容，完成後按「停止錄音並分析」。");
      } catch (error) {
        stopTracks();
        let message = "無法使用麥克風，請確認瀏覽器權限。";
        if (error instanceof DOMException && error.name === "NotAllowedError") message = "麥克風權限被拒絕，請到瀏覽器或手機設定允許麥克風。";
        if (error instanceof DOMException && error.name === "NotFoundError") message = "找不到麥克風裝置，請確認裝置是否正常。";
        setFeedbackTitle("麥克風無法使用");
        setFeedbackText(message);
        setStatus("錄音失敗");
      }
      return;
    }

    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.requestData();
      recorderRef.current.stop();
      setStatus("準備分析...");
    }
  }

  return (
    <main className="app">
      <nav className="nav">
        <div className="brand">
          <div className="logo">話</div>
          <div>
            AI Speaking Coach<br />
            <small>10分鐘口說練習 MVP</small>
          </div>
          <select
            className="language-select"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as Lang);
              setCurrentIndex(0);
              resetScore("已切換語系", "請按錄音開始新的語系練習。");
            }}
          >
            <option value="ja">🇯🇵 日本語</option>
            <option value="en">🇺🇸 English</option>
            <option value="ko">🇰🇷 한국어</option>
            <option value="es">🇪🇸 Español</option>
          </select>
        </div>
        <div className="nav-pill">Web Demo｜無需 App｜適合初學者</div>
      </nav>

      <section className="hero">
        <div className="panel intro">
          <div>
            <div className="badge">🎧 AI 發音信心訓練</div>
            <h1>10分鐘多語系口說練習，讓初學者敢開口。</h1>
            <p className="lead">透過字卡、錄音、Whisper 語音辨識、GPT 發音評分與修正建議，完成第一階段 MVP 的核心流程。</p>
            <div className="features">
              <div className="feature"><b>01 字卡練習</b><span>依語系切換字卡，學生依序朗讀。</span></div>
              <div className="feature"><b>02 錄音辨識</b><span>瀏覽器錄音後送到 /api/speech 轉文字。</span></div>
              <div className="feature"><b>03 AI 評分</b><span>送到 /api/feedback 回傳分數與建議。</span></div>
            </div>
            {notice && <div className="notice">{notice}</div>}
          </div>
          <div className="start-area">
            <button className="btn-main" onClick={startDemo}>開始 10 分鐘體驗</button>
            <button className="btn-ghost" onClick={resetDemo}>重新開始</button>
          </div>
        </div>

        <div className="panel trainer">
          <div className="timer-card">
            <div className="timer-top">
              <div>
                <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 6 }}>剩餘體驗時間</div>
                <div className="timer">{formatTime(remainingSeconds)}</div>
              </div>
              <div className="status">{status}</div>
            </div>
            <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
          </div>

          <div className="card">
            <div className="card-title">今日字卡</div>
            <div className="target-word">{card.text}</div>
            <div className="romaji">{card.romaji}</div>
            <p className="meaning">{card.meaning}</p>
            <div className="controls">
              <button className={`record-btn ${isRecording ? "recording" : ""}`} onClick={handleRecord} disabled={isAnalyzing}>
                {isAnalyzing ? "分析中..." : isRecording ? "⏹️ 停止錄音並分析" : score === null ? "🎙️ 開始錄音" : "🎙️ 再錄一次"}
              </button>
              <button className="next-btn" onClick={nextCard}>下一張字卡 →</button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">AI 發音回饋</div>
            <div className="score-box">
              <div className="score-circle" style={{ background: `conic-gradient(#d97706 ${scoreDegree}deg,#f3eadf 0deg)` }}>
                <div className="score-num">{score === null ? "--" : score}</div>
              </div>
              <div className="feedback">
                <h3>{feedbackTitle}</h3>
                <p>{feedbackText}</p>
                {transcript && <div className="transcript">辨識結果：{transcript}</div>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">練習紀錄</div>
            <div className="log-list">
              {!logs.length ? <p className="empty">目前尚無紀錄。完成錄音後會顯示練習分數。</p> : logs.map((item, index) => (
                <div className="log-item" key={`${item.text}-${item.time}-${index}`}>
                  <span><strong>{item.text}</strong><br /><small>{item.time}</small></span>
                  <b>{item.score} 分</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {showModal && (
        <div className="modal">
          <div className="modal-box">
            <h2>體驗完成 🎉</h2>
            <p>{summaryText}</p>
            <button className="btn-main" onClick={resetDemo}>再練一次</button>
          </div>
        </div>
      )}
    </main>
  );
}
