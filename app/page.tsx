"use client";

import { useState } from "react";

type ScriptSet = {
  title?: string;
  toneName?: string;
  hook?: string;
  script15?: string;
  script25?: string;
  captionScript?: string;
  shotList?: string[];
  ctaList?: string[];
};

type Result = {
  systemStatus?: string;
  youtubeStatus?: string;
  collectedVideos?: any[];
  accountScout?: string;
  benchmarkReport?: string;
  winningPatterns?: string[];
  hookBank?: string[];
  captionPatterns?: string[];
  shootingPatterns?: string[];
  scriptSets?: ScriptSet[];
  thumbnailCopy?: string[];
  commentHooks?: string[];
  nextVideoIdeas?: string[];
  warning?: string;
};

export default function Home() {
  const [keyword, setKeyword] = useState("주방 투명 시트지");
  const [target, setTarget] = useState("제휴쇼핑 전환을 노리는 숏폼 시청자");
  const [manualUrls, setManualUrls] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("report");
  const [result, setResult] = useState<Result | null>(null);

  async function analyze() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ keyword, target, manualUrls, memo })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "분석 중 오류가 났어요.");
        return;
      }
      setResult(data.result);
    } catch (e) {
      alert("오류가 났어요. OpenAI 크레딧/API 설정을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    ["report", "벤치마킹 리포트"],
    ["status", "상태"],
    ["videos", "수집영상"],
    ["accounts", "계정 Scout"],
    ["patterns", "패턴"],
    ["scripts", "대본 세트"],
    ["captions", "자막/컷"],
    ["thumb", "썸네일"],
    ["comments", "댓글/CTA"],
    ["ideas", "다음 아이디어"]
  ];

  function scriptsText(mode: "scripts" | "captions") {
    const arr = result?.scriptSets || [];
    if (!arr.length) return "대본 세트가 없습니다.";
    return arr.map((s, i) => {
      if (mode === "captions") {
        return `==============================
${i + 1}. ${s.title || s.toneName || "대본 세트"}

[캡컷 자막]
${s.captionScript || ""}

[촬영 컷 구성]
${(s.shotList || []).map((x, idx) => `${idx + 1}. ${x}`).join("\n")}

[CTA]
${(s.ctaList || []).map((x, idx) => `${idx + 1}. ${x}`).join("\n")}`;
      }
      return `==============================
${i + 1}. ${s.title || s.toneName || "대본 세트"}

[후킹]
${s.hook || ""}

[15초 대본]
${s.script15 || ""}

[25초 대본]
${s.script25 || ""}`;
    }).join("\n\n");
  }

  function text() {
    if (!result) return "키워드를 입력하고 분석 시작 버튼을 눌러주세요.";

    if (tab === "status") return `시스템 상태\n${result.systemStatus || "-"}\n\n유튜브 수집 상태\n${result.youtubeStatus || "-"}\n\n주의\n${result.warning || "-"}`;
    if (tab === "report") return result.benchmarkReport || "";
    if (tab === "videos") {
      const videos = result.collectedVideos || [];
      if (!videos.length) return "수집된 영상이 없습니다.\n\nYOUTUBE_API_KEY가 Vercel 환경변수에 없으면 유튜브 자동 수집이 작동하지 않습니다.";
      return videos.map((v: any, i: number) =>
        `${i + 1}. ${v.title || "제목 없음"}\n채널: ${v.channelTitle || "-"}\n조회수: ${v.viewCount?.toLocaleString?.() || v.viewCount || "-"}\n좋아요: ${v.likeCount?.toLocaleString?.() || v.likeCount || "-"}\n댓글: ${v.commentCount?.toLocaleString?.() || v.commentCount || "-"}\nURL: ${v.url || "-"}\n`
      ).join("\n");
    }
    if (tab === "accounts") return result.accountScout || "";
    if (tab === "patterns") {
      return `조회수 잘 나오는 공통 패턴\n${(result.winningPatterns || []).map((x, i) => `${i+1}. ${x}`).join("\n")}

후킹 뱅크\n${(result.hookBank || []).map((x, i) => `${i+1}. ${x}`).join("\n")}

자막 패턴\n${(result.captionPatterns || []).map((x, i) => `${i+1}. ${x}`).join("\n")}

촬영구도 패턴\n${(result.shootingPatterns || []).map((x, i) => `${i+1}. ${x}`).join("\n")}`;
    }
    if (tab === "scripts") return scriptsText("scripts");
    if (tab === "captions") return scriptsText("captions");
    if (tab === "thumb") return (result.thumbnailCopy || []).map((x, i) => `${i+1}. ${x}`).join("\n");
    if (tab === "comments") return (result.commentHooks || []).map((x, i) => `${i+1}. ${x}`).join("\n");
    if (tab === "ideas") return (result.nextVideoIdeas || []).map((x, i) => `${i+1}. ${x}`).join("\n");
    return "";
  }

  async function copy() {
    await navigator.clipboard.writeText(text());
    alert("복사됐어요.");
  }

  return (
    <main className="wrap">
      <section className="hero">
        <p className="eyebrow">폼생폼생 전용 · 숏폼 벤치마킹 AI</p>
        <h1>폼생AI Scout Pro</h1>
        <p>키워드 하나로 쇼츠 데이터를 수집하고, 잘되는 패턴을 분석해서 여러 톤의 대본·자막·촬영컷으로 뽑아냅니다.</p>
        <span>Research → Benchmark → Script Sets</span>
      </section>

      <section className="card">
        <h2>리서치 입력</h2>
        <label>키워드 / 상품명</label>
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="예: 무선 전동 스퀴지" />

        <label>목표 시청자</label>
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="예: 생활꿀템 좋아하는 20~40대" />

        <label>틱톡/인스타/쇼츠 URL 수동 입력</label>
        <textarea value={manualUrls} onChange={e => setManualUrls(e.target.value)} placeholder={"벤치마킹할 URL이나 영상 자막을 줄바꿈으로 넣으세요\nhttps://www.youtube.com/shorts/...\nhttps://www.instagram.com/reel/...\nhttps://www.tiktok.com/...\n\n또는 영상에서 본 대사를 직접 붙여넣어도 됩니다."} />

        <label>추가 메모</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: 광고 느낌 빼고, 실제 써본 것처럼. 첫 2초 후킹 강하게. 제휴링크 클릭 유도." />

        <button className="mainBtn" onClick={analyze} disabled={loading || !keyword.trim()}>
          {loading ? "진짜 벤치마킹 분석 중..." : "Pro 분석 시작"}
        </button>
      </section>

      <section className="card">
        <div className="resultTop">
          <h2>분석 결과</h2>
          <button className="copyBtn" onClick={copy}>현재 탭 복사</button>
        </div>

        <div className="tabs">
          {tabs.map(([id, name]) => (
            <button key={id} onClick={() => setTab(id)} className={tab === id ? "active" : ""}>{name}</button>
          ))}
        </div>

        <pre>{text()}</pre>
      </section>
    </main>
  );
}
