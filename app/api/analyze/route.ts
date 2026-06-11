import { NextResponse } from "next/server";
import OpenAI from "openai";

function num(x: any) {
  const n = Number(x || 0);
  return Number.isFinite(n) ? n : 0;
}

function scoreVideo(v: any) {
  const views = num(v.viewCount);
  const likes = num(v.likeCount);
  const comments = num(v.commentCount);
  const engagement = views > 0 ? ((likes + comments * 3) / views) * 100 : 0;
  return Math.round((Math.log10(views + 1) * 15) + engagement * 8);
}

async function searchYouTube(keyword: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { status: "YOUTUBE_API_KEY가 없어 유튜브 자동 수집을 건너뜁니다.", videos: [], channels: [] };
  }

  try {
    const queries = [
      `${keyword} shorts`,
      `${keyword} 쇼츠`,
      `${keyword} 리뷰`,
      `${keyword} 꿀템`,
      `${keyword} 추천템`
    ];

    const idSet = new Set<string>();

    for (const q of queries) {
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("q", q);
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("maxResults", "10");
      searchUrl.searchParams.set("order", "viewCount");
      searchUrl.searchParams.set("videoDuration", "short");
      searchUrl.searchParams.set("key", key);

      const searchRes = await fetch(searchUrl.toString(), { cache: "no-store" });
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      for (const item of searchData.items || []) {
        if (item.id?.videoId) idSet.add(item.id.videoId);
      }
    }

    const ids = Array.from(idSet).slice(0, 50);
    if (!ids.length) return { status: "유튜브 검색 결과가 없습니다.", videos: [], channels: [] };

    const videos: any[] = [];
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "snippet,statistics,contentDetails");
    videosUrl.searchParams.set("id", ids.join(","));
    videosUrl.searchParams.set("key", key);

    const videoRes = await fetch(videosUrl.toString(), { cache: "no-store" });
    if (!videoRes.ok) {
      const txt = await videoRes.text();
      return { status: `유튜브 상세 조회 실패: ${videoRes.status} ${txt.slice(0, 160)}`, videos: [], channels: [] };
    }

    const videoData = await videoRes.json();

    for (const v of videoData.items || []) {
      const row = {
        title: v.snippet?.title || "",
        description: v.snippet?.description || "",
        channelTitle: v.snippet?.channelTitle || "",
        channelId: v.snippet?.channelId || "",
        publishedAt: v.snippet?.publishedAt || "",
        viewCount: num(v.statistics?.viewCount),
        likeCount: num(v.statistics?.likeCount),
        commentCount: num(v.statistics?.commentCount),
        url: `https://www.youtube.com/watch?v=${v.id}`
      };
      (row as any).benchmarkScore = scoreVideo(row);
      videos.push(row);
    }

    const sorted = videos.sort((a, b) => b.viewCount - a.viewCount).slice(0, 50);

    const byChannel: Record<string, any> = {};
    for (const v of sorted) {
      const key2 = v.channelId || v.channelTitle;
      if (!byChannel[key2]) {
        byChannel[key2] = {
          channelTitle: v.channelTitle,
          channelId: v.channelId,
          videoCount: 0,
          totalViews: 0,
          maxViews: 0,
          sampleUrl: v.url,
          titles: []
        };
      }
      byChannel[key2].videoCount += 1;
      byChannel[key2].totalViews += v.viewCount;
      byChannel[key2].maxViews = Math.max(byChannel[key2].maxViews, v.viewCount);
      byChannel[key2].titles.push(v.title);
      if (v.viewCount >= byChannel[key2].maxViews) byChannel[key2].sampleUrl = v.url;
    }

    const channels = Object.values(byChannel).map((c: any) => ({
      ...c,
      avgViews: Math.round(c.totalViews / Math.max(c.videoCount, 1)),
      score: Math.round(Math.log10(c.totalViews + 1) * 20 + c.videoCount * 5)
    })).sort((a: any, b: any) => b.score - a.score).slice(0, 20);

    return { status: `유튜브 영상 ${sorted.length}개, 계정 ${channels.length}개 수집 완료`, videos: sorted, channels };
  } catch (e: any) {
    return { status: `유튜브 수집 오류: ${e?.message || "unknown"}`, videos: [], channels: [] };
  }
}

async function fetchPageText(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 PomsaengAIScoutV3/1.0",
        "Accept": "text/html,application/xhtml+xml"
      },
      cache: "no-store"
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 9000);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const { keyword, target, manualUrls, memo } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
    }
    if (!keyword) {
      return NextResponse.json({ error: "키워드를 입력해주세요." }, { status: 400 });
    }

    const yt = await searchYouTube(keyword);

    const rawLines = String(manualUrls || "")
      .split(/\n+/)
      .map((x: string) => x.trim())
      .filter(Boolean)
      .slice(0, 15);

    const manualData = [];
    for (const item of rawLines) {
      if (item.startsWith("http")) {
        const text = await fetchPageText(item);
        manualData.push({ input: item, text: text || "본문을 읽지 못했습니다. URL 자체와 사용자 메모를 바탕으로 분석하세요." });
      } else {
        manualData.push({ input: "직접 입력 텍스트", text: item });
      }
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
너는 한국 숏폼 제휴마케팅 벤치마킹 전문가다.
사용자는 인기 숏폼을 분석해서 조회수를 올리고 제휴쇼핑 수익을 내고 싶어한다.

절대 블로그 말투로 쓰지 마라.
"추천합니다", "써보세요" 반복 금지.
첫 2초 후킹은 강하게, 대본은 실제 릴스/쇼츠에서 말하는 구어체로 써라.
문장은 짧게. 촬영 가능한 컷 단위로 구체화해라.

키워드:
${keyword}

목표 시청자:
${target || "숏폼 시청자"}

사용자 메모:
${memo || "없음"}

유튜브 수집 상태:
${yt.status}

유튜브 수집 영상 TOP 데이터:
${JSON.stringify(yt.videos.slice(0, 35), null, 2)}

유튜브 계정 Scout 데이터:
${JSON.stringify(yt.channels.slice(0, 15), null, 2)}

틱톡/인스타/쇼츠 수동 입력 데이터:
${JSON.stringify(manualData, null, 2)}

반드시 해야 할 일:
1. 실제 수집 영상이 있으면 제목/조회수/채널을 근거로 분석한다.
2. 계정 Scout는 어떤 계정을 벤치마킹해야 하는지 점수 기준으로 말한다.
3. 대본 세트는 최소 12개 만든다.
4. 각 대본은 15초/25초 모두 최소 7문장 이상.
5. 캡컷 자막은 최소 10줄 이상.
6. 촬영 컷은 6~9개.
7. 제휴링크 클릭 유도는 자연스럽게.
8. 상품명 직접 판매보다 "나도 써보고 싶게 만드는 숏폼"에 집중한다.
9. 12개의 대본은 서로 완전히 다른 구매심리를 기반으로 작성한다.
10. 같은 후킹, 같은 문제제기, 같은 CTA를 절대 반복하지 않는다.
11. 상품 특징 설명보다 구매자의 감정과 불편함을 먼저 건드린다.
12. 아래 유형을 각각 최소 1개 이상 포함한다.

- 충격형
- 공감형
- 비교형
- 후기형
- 실험형
- 실수방지형
- 비용절약형
- 귀찮음해결형
- 가족공감형
- 전후비교형
- 새집보호형
- 손해회피형

13. "추천합니다", "써보세요", "프로필 링크 확인", "강력 추천" 사용 금지.
14. 실제 사용자가 말하는 후기처럼 작성한다.
15. 첫 문장은 반드시 스크롤을 멈추게 만드는 문장으로 작성한다.
16. 상품 설명보다 구매 이유를 먼저 설명한다.
17. 모든 대본은 다른 영상처럼 느껴져야 한다.

출력은 JSON만.

형식:
{
  "systemStatus": "분석 상태 요약",
  "youtubeStatus": "유튜브 수집 상태",
  "warning": "한계나 주의사항",
  "collectedVideos": [
    {"title": "영상제목", "channelTitle": "채널명", "viewCount": 0, "likeCount": 0, "commentCount": 0, "publishedAt": "게시일", "url": "URL"}
  ],
  "channelScout": [
    {"channelTitle": "채널명", "videoCount": 0, "totalViews": 0, "avgViews": 0, "maxViews": 0, "score": 0, "sampleUrl": "URL"}
  ],
  "accountScout": "계정 Scout 리포트. 어떤 계정을 왜 봐야 하는지, 구독자보다 평균조회수를 우선해야 하는 이유, 프로필 링크/제휴형 계정 체크법까지 작성",
  "benchmarkReport": "긴 벤치마킹 리포트. 조회수 높은 영상 제목에서 보이는 공통점, 시청자 심리, 후킹 구조, 자막 흐름, 촬영 방식, 내 계정 적용법을 자세히 작성",
  "winningPatterns": ["조회수 잘 나오는 공통 패턴 20개"],
  "hookBank": ["바로 써먹는 후킹 50개"],
  "captionPatterns": ["자막 흐름/문장 패턴 20개"],
  "shootingPatterns": ["촬영구도/컷 구성 패턴 20개"],
  "scriptSets": [
    {
      "title": "대본 제목",
      "toneName": "톤 이름",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script25": "25초 대본",
      "captionScript": "캡컷 줄바꿈 자막",
      "shotList": ["촬영 컷"],
      "ctaList": ["CTA"]
    }
  ],
  "thumbnailCopy": ["썸네일 문구 40개"],
  "commentHooks": ["댓글 유도 문구 30개"],
  "nextVideoIdeas": ["다음에 찍을 영상 아이디어 50개"]
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "너는 한국어 숏폼 벤치마킹 분석 전문가다. JSON만 출력한다." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.85
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    result.youtubeStatus = result.youtubeStatus || yt.status;
    result.systemStatus = result.systemStatus || "분석 완료";
    result.collectedVideos = (yt.videos || []).map((v: any) => ({
      title: v.title,
      channelTitle: v.channelTitle,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      publishedAt: v.publishedAt,
      url: v.url
    }));
    result.channelScout = (yt.channels || []).map((c: any) => ({
      channelTitle: c.channelTitle,
      videoCount: c.videoCount,
      totalViews: c.totalViews,
      avgViews: c.avgViews,
      maxViews: c.maxViews,
      score: c.score,
      sampleUrl: c.sampleUrl
    }));

    return NextResponse.json({ result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
