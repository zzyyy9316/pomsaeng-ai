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
  channelScout?: any[];
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
  buyerPsychology?: string;
channelPackage?: string;
  warning?: string;
};

export default function Home() {
  const [keyword, setKeyword] = useState("주방 투명 시트지");
  const [target, setTarget] = useState("제휴쇼핑 전환을 노리는 숏폼 시청자");
  const [manualUrls, setManualUrls] = useState("");
  const [memo, setMemo] = useState("광고 느낌 빼고 실제 써본 것처럼. 첫 2초 후킹 강하게.");
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
      alert("오류가 났어요. API 키/크레딧 설정을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    ["report", "벤치마킹"],
    ["psychology", "구매심리"],
["channelPackage", "채널패키지"],
    ["status", "상태"],
    ["videos", "수집영상"],
    ["channels", "계정 Scout"],
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
    if (tab === "psychology") return result.buyerPsychology || "구매심리 분석이 없습니다.";
if (tab === "channelPackage") return result.channelPackage || "채널패키지가 없습니다.";

    if (tab === "status") return `시스템 상태
${result.systemStatus || "-"}

유튜브 수집 상태
${result.youtubeStatus || "-"}

주의
${result.warning || "-"}`;
    if (tab === "report") return result.benchmarkReport || "";
    if (tab === "videos") {
      const videos = result.collectedVideos || [];
      if (!videos.length) return "수집된 영상이 없습니다. YOUTUBE_API_KEY 또는 검색 결과를 확인해주세요.";
      return videos.map((v: any, i: number) =>
        `${i + 1}. ${v.title || "제목 없음"}
채널: ${v.channelTitle || "-"}
조회수: ${Number(v.viewCount || 0).toLocaleString()}
좋아요: ${Number(v.likeCount || 0).toLocaleString()}
댓글: ${Number(v.commentCount || 0).toLocaleString()}
게시일: ${v.publishedAt || "-"}
URL: ${v.url || "-"}
`
      ).join("\n");
    }
    if (tab === "channels") {
      const channels = result.channelScout || [];
      const list = channels.length ? channels.map((c: any, i: number) =>
        `${i + 1}. ${c.channelTitle || "-"}
영상 수: ${c.videoCount || 0}
총 조회수: ${Number(c.totalViews || 0).toLocaleString()}
평균 조회수: ${Number(c.avgViews || 0).toLocaleString()}
최고 조회수: ${Number(c.maxViews || 0).toLocaleString()}
벤치마킹 점수: ${c.score || "-"}
대표 URL: ${c.sampleUrl || "-"}
`
      ).join("\n") : "";
      return `${result.accountScout || ""}

==============================
[계정 Scout 데이터]

${list || "계정 데이터가 없습니다."}`;
    }
    if (tab === "patterns") {
      return `조회수 잘 나오는 공통 패턴
${(result.winningPatterns || []).map((x, i) => `${i+1}. ${x}`).join("\n")}

후킹 뱅크
${(result.hookBank || []).map((x, i) => `${i+1}. ${x}`).join("\n")}

자막 패턴
${(result.captionPatterns || []).map((x, i) => `${i+1}. ${x}`).join("\n")}

촬영구도 패턴
${(result.shootingPatterns || []).map((x, i) => `${i+1}. ${x}`).join("\n")}`;
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
        <h1>폼생AI Scout v3</h1>
        <p>유튜브 쇼츠를 실제 수집하고, 인스타/틱톡 URL을 수동 분석해서 후킹·자막·촬영구도·대본 세트로 바꿉니다.</p>
        <span>YouTube Auto + TikTok/Instagram Manual + Account Scout</span>
      </section>

      <section className="card">
        <h2>리서치 입력</h2>
        <label>키워드 / 상품명</label>
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="예: 무선 전동 스퀴지" />

        <label>목표 시청자</label>
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="예: 생활꿀템 좋아하는 20~40대" />

        <label>틱톡/인스타/쇼츠 URL 또는 자막 수동 입력</label>
        <textarea value={manualUrls} onChange={e => setManualUrls(e.target.value)} placeholder={"벤치마킹할 URL이나 영상 자막을 줄바꿈으로 넣으세요\nhttps://www.youtube.com/shorts/...\nhttps://www.instagram.com/reel/...\nhttps://www.tiktok.com/...\n\n또는 영상에서 본 대사를 직접 붙여넣어도 됩니다."} />

        <label>추가 메모</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: 광고 느낌 빼고, 실제 써본 것처럼. 첫 2초 후킹 강하게." />

        <button className="mainBtn" onClick={analyze} disabled={loading || !keyword.trim()}>
          {loading ? "v3 벤치마킹 수집 중..." : "v3 분석 시작"}
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
