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

    const ids = Array.from(idSet).slice(0, 12);
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

    const sorted = videos.sort((a, b) => b.viewCount - a.viewCount).slice(0, 12);

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
    })).sort((a: any, b: any) => b.score - a.score).slice(0, 8);

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
      .slice(0, 1500);
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
너는 쇼핑숏폼 패키지 생성 AI다.

목표:
상품 하나를 입력받아 유튜브 쇼츠, 인스타 릴스, 틱톡, 스레드에 바로 쓸 수 있는 콘텐츠 패키지를 만든다.

중요:
- 유튜브 수집 데이터는 참고자료일 뿐이다.
- 결과물의 중심은 "채널별 숏폼 제작 패키지"와 "대본 세트"다.
- collectedVideos와 channelScout는 서버에서 자동으로 채운다. 너는 생성하지 마라.
- JSON만 출력한다.
- 마크다운 금지.
- 설명문 금지.
- 코드블록 금지.
- 모든 값은 문자열 또는 배열로 채운다.
- 빈 값 금지.
- 너무 길게 쓰지 말고, 실제 릴스/쇼츠에 바로 쓸 수 있게 짧게 쓴다.

입력 정보:
키워드: ${keyword}
목표 시청자: ${target || "숏폼 시청자"}
사용자 메모: ${memo || "광고 느낌 빼고 실제 써본 것처럼. 첫 2초 후킹 강하게."}

유튜브 수집 상태:
${yt.status}

유튜브 참고 영상:
${JSON.stringify(
  yt.videos.slice(0, 5).map((v: any) => ({
    title: v.title,
    channelTitle: v.channelTitle,
    viewCount: v.viewCount
  })),
  null,
  2
)}

수동 입력 참고:
${JSON.stringify(manualData.slice(0, 2), null, 2)}

작성 규칙:
- 광고 말투 금지.
- "추천합니다", "써보세요", "강력 추천", "대박", "인생템", "무조건 사세요", "프로필 링크 확인" 금지.
- 상품 기능보다 구매자가 겪는 상황, 감정, 불편함을 먼저 건드린다.
- 첫 문장은 스크롤을 멈추게 만든다.
- 대본은 구어체로 짧고 리듬감 있게 쓴다.
- 각 대본은 서로 다른 구매심리를 사용한다.
- CTA는 댓글, 저장, 공감 유도 중심으로 쓴다.
- 입력 데이터에 없는 사실은 단정하지 말고 후기형으로 쓴다.
- 후킹은 "힘드시죠?", "공감하시죠?", "불편하셨죠?" 같은 질문형으로 시작하지 마라.
- 후킹은 손해, 결과, 반전, 후회, 상황 공감 중 하나로 시작한다.

반드시 아래 JSON 구조로만 출력해라.

{
  "systemStatus": "분석 완료",
  "youtubeStatus": "유튜브 수집 상태 요약",
  "warning": "참고 데이터 한계와 주의사항",
 
"channelPackage": "유튜브 쇼츠\\n제목 3개\\n후킹 3개\\n쇼츠 대본 2개\\n\\n인스타 릴스\\n릴스 후킹 3개\\n캡션 3개\\n릴스 대본 2개\\n\\n틱톡\\n틱톡 후킹 3개\\n틱톡 대본 2개\\n\\n스레드\\n공감글 2개\\n질문글 2개",
  "accountScout": "벤치마킹할 계정 방향과 이유를 짧게 설명",
  "benchmarkReport": "조회수 패턴, 시청자 심리, 후킹 구조, 내 채널 적용법을 짧게 정리",
  "winningPatterns": ["패턴 1", "패턴 2", "패턴 3", "패턴 4", "패턴 5"],
  "hookBank": ["후킹 1", "후킹 2", "후킹 3", "후킹 4", "후킹 5", "후킹 6", "후킹 7", "후킹 8"],
  "scriptSets": [
    {
      "title": "충격형",
      "toneName": "결과 먼저 보여주는 톤",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 자막 5줄",
      "ctaList": ["CTA 1"]
    },
    {
      "title": "공감형",
      "toneName": "일상 공감 톤",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 자막 5줄",
      "ctaList": ["CTA 1"]
    },
    {
      "title": "후기형",
      "toneName": "써보고 말하는 톤",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 자막 5줄",
      "ctaList": ["CTA 1"]
    },
    {
      "title": "비교형",
      "toneName": "전후 비교 톤",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 자막 5줄",
      "ctaList": ["CTA 1"]
    },
    {
      "title": "실수방지형",
      "toneName": "손해 방지 톤",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 자막 5줄",
      "ctaList": ["CTA 1"]
    },
    {
      "title": "스토리형",
      "toneName": "상황 스토리 톤",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 자막 5줄",
      "ctaList": ["CTA 1"]
    }
  ],
  "thumbnailCopy": ["썸네일 1", "썸네일 2", "썸네일 3", "썸네일 4", "썸네일 5", "썸네일 6", "썸네일 7", "썸네일 8"],
  "commentHooks": ["댓글 유도 1", "댓글 유도 2", "댓글 유도 3", "댓글 유도 4", "댓글 유도 5", "댓글 유도 6", "댓글 유도 7", "댓글 유도 8"],
  "nextVideoIdeas": ["다음 영상 1", "다음 영상 2", "다음 영상 3", "다음 영상 4", "다음 영상 5", "다음 영상 6"]
}
`;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 55000);

let completion;

try {
  completion = await client.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "너는 쇼핑 콘텐츠 운영 콘솔 AI다. JSON만 출력한다."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
      max_tokens: 4500
    },
    {
      signal: controller.signal
    }
  );
} finally {
  clearTimeout(timeout);
}

  let result: any = {};

try {
  result = JSON.parse(
    completion.choices?.[0]?.message?.content || "{}"
  );
} catch {
  result = {
    systemStatus: "JSON_PARSE_ERROR"
  };
}

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
