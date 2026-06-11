import { NextResponse } from "next/server";
import OpenAI from "openai";

function num(x: any) {
  const n = Number(x || 0);
  return Number.isFinite(n) ? n : 0;
}

async function searchYouTube(keyword: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { status: "YOUTUBE_API_KEY가 없어 유튜브 자동 수집을 건너뜁니다.", videos: [] };
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", `${keyword} shorts 쇼츠 릴스 틱톡 꿀템 리뷰 추천템`);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", "25");
    searchUrl.searchParams.set("order", "viewCount");
    searchUrl.searchParams.set("videoDuration", "short");
    searchUrl.searchParams.set("key", key);

    const searchRes = await fetch(searchUrl.toString(), { cache: "no-store" });
    if (!searchRes.ok) {
      const txt = await searchRes.text();
      return { status: `유튜브 검색 실패: ${searchRes.status} ${txt.slice(0, 200)}`, videos: [] };
    }

    const searchData = await searchRes.json();
    const ids = (searchData.items || []).map((x: any) => x.id?.videoId).filter(Boolean);
    if (!ids.length) return { status: "유튜브 검색 결과가 없습니다.", videos: [] };

    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("part", "snippet,statistics,contentDetails");
    videosUrl.searchParams.set("id", ids.join(","));
    videosUrl.searchParams.set("key", key);

    const videoRes = await fetch(videosUrl.toString(), { cache: "no-store" });
    if (!videoRes.ok) {
      const txt = await videoRes.text();
      return { status: `유튜브 상세 조회 실패: ${videoRes.status} ${txt.slice(0, 200)}`, videos: [] };
    }

    const videoData = await videoRes.json();

    const videos = (videoData.items || [])
      .map((v: any) => ({
        title: v.snippet?.title || "",
        description: v.snippet?.description || "",
        channelTitle: v.snippet?.channelTitle || "",
        publishedAt: v.snippet?.publishedAt || "",
        viewCount: num(v.statistics?.viewCount),
        likeCount: num(v.statistics?.likeCount),
        commentCount: num(v.statistics?.commentCount),
        url: `https://www.youtube.com/watch?v=${v.id}`
      }))
      .sort((a: any, b: any) => b.viewCount - a.viewCount);

    return { status: `유튜브 영상 ${videos.length}개 수집 완료`, videos };
  } catch (e: any) {
    return { status: `유튜브 수집 오류: ${e?.message || "unknown"}`, videos: [] };
  }
}

async function fetchPageText(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 PomsaengAIScoutPro/1.0",
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

function safeFallback(keyword: string) {
  return {
    systemStatus: "OpenAI 응답이 비정상이라 기본 출력으로 대체했습니다.",
    youtubeStatus: "-",
    collectedVideos: [],
    accountScout: "YouTube API 키를 연결하면 실제 영상/채널 데이터를 바탕으로 계정 Scout가 가능합니다.",
    benchmarkReport: `${keyword} 키워드의 숏폼은 첫 2초 후킹, 사용 전후 비교, 실제 후기 느낌, 짧은 자막 리듬이 중요합니다.`,
    winningPatterns: ["첫 2초 안에 문제를 찌른다", "사용 장면을 바로 보여준다", "광고보다 후기처럼 말한다"],
    hookBank: ["이거 왜 이제 알았지?", "아직도 이거 없이 쓰세요?", "써보고 진짜 편했던 이유"],
    captionPatterns: ["문제 제기 → 해결 → 사용 장면 → CTA"],
    shootingPatterns: ["클로즈업", "사용 전후 비교", "손으로 직접 시연"],
    scriptSets: [
      {
        title: "실제 후기형",
        toneName: "실제 후기 느낌",
        hook: "이거 별 기대 안 했는데 생각보다 진짜 편합니다.",
        script15: "이거 별 기대 안 했는데요. 써보니까 매일 불편했던 부분이 확 줄었어요. 특히 관리가 쉬워서 손이 덜 갑니다. 궁금하면 아래에서 확인해보세요.",
        script25: "처음엔 그냥 평범한 제품인 줄 알았는데요. 막상 써보니까 매일 귀찮았던 부분이 확 줄었습니다. 사용도 어렵지 않고, 관리도 편해서 계속 손이 가요. 생활 속 불편함 줄이고 싶다면 아래 링크에서 확인해보세요.",
        captionScript: "별 기대 없었는데\\n써보니까 편함\\n매일 귀찮던 부분 해결\\n관리도 쉬움\\n아래에서 확인",
        shotList: ["문제 상황 클로즈업", "제품 등장", "사용 장면", "전후 비교", "CTA"],
        ctaList: ["궁금하면 아래에서 확인해보세요", "링크에서 옵션 확인해보세요"]
      }
    ],
    thumbnailCopy: ["왜 이제 알았지?", "이거 진짜 편함", "생활꿀템 인정"],
    commentHooks: ["이거 써본 사람?", "이런 거 더 추천해드릴까요?"],
    nextVideoIdeas: ["사용 전후 비교 영상", "3일 써본 후기 영상"]
  };
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
너는 한국 숏폼 제휴마케팅 리서치 총괄이다.
사용자는 주문/쇼핑몰 운영이 아니라, 인기 숏폼을 벤치마킹해서 본인 계정 조회수를 올리고 제휴쇼핑 수익을 내고 싶어한다.

절대 허접하게 한 줄로 쓰지 마라.
각 대본은 실제 촬영 가능한 수준으로 구체적으로 써라.
짧은 문장, 구어체, 실제 후기 느낌, 첫 2초 후킹을 우선한다.
단, 과장/허위효능/보장 표현은 피한다.

분석 키워드:
${keyword}

목표 시청자:
${target || "숏폼 시청자"}

사용자 메모:
${memo || "없음"}

유튜브 수집 상태:
${yt.status}

유튜브 수집 영상:
${JSON.stringify(yt.videos.slice(0, 25), null, 2)}

수동 입력 URL/자막/메모:
${JSON.stringify(manualData, null, 2)}

반드시 해야 할 일:
1. 수집 영상이 있으면 영상 제목/채널/조회수 기반으로 패턴 분석.
2. 수집 영상이 없어도 "데이터 없음"이라고만 하지 말고, 키워드 기반 가설 벤치마킹을 풍부하게 작성.
3. 계정 Scout에서는 어떤 계정을 찾아야 하는지 기준을 제안.
4. 대본 세트는 최소 10개 만든다.
5. 각 대본 세트는 15초 대본, 25초 대본, 캡컷 자막, 촬영 컷, CTA까지 포함한다.
6. 톤은 다양하게: 실제 후기형, 강한 후킹형, 예능형, 정보형, 엄마템형, 비교형, 반전형, 댓글유도형, 문제공감형, 짧은 바이럴형.
7. 쿠팡 제목/테무 제목/상품등록/주문/결제 내용은 만들지 마라.

출력은 JSON만.

형식:
{
  "systemStatus": "분석 상태 요약",
  "youtubeStatus": "유튜브 수집 상태",
  "warning": "필요한 설정이나 한계 안내",
  "collectedVideos": [
    {"title": "영상제목", "channelTitle": "채널명", "viewCount": 0, "likeCount": 0, "commentCount": 0, "url": "URL"}
  ],
  "accountScout": "계정 Scout 리포트. 어떤 계정을 찾아야 하는지, 프로필 링크, 업로드 주기, 팔로워/구독자, 평균 조회수, 콘텐츠 유형 기준을 자세히 제안",
  "benchmarkReport": "긴 벤치마킹 리포트. 이 키워드에서 왜 조회수가 나오는지, 어떤 후킹이 먹히는지, 영상 구조, 시청자 심리, 제휴링크 클릭 유도까지 자세히 작성",
  "winningPatterns": ["조회수 잘 나오는 공통 패턴 15개"],
  "hookBank": ["바로 써먹을 후킹 40개"],
  "captionPatterns": ["자막 흐름/문장 패턴 20개"],
  "shootingPatterns": ["촬영구도/컷 구성 패턴 20개"],
  "scriptSets": [
    {
      "title": "대본 제목",
      "toneName": "톤 이름",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본. 최소 6문장 이상",
      "script25": "25초 대본. 최소 9문장 이상",
      "captionScript": "캡컷에 바로 붙일 수 있는 줄바꿈 자막. 최소 8줄 이상",
      "shotList": ["촬영 컷 5~8개"],
      "ctaList": ["CTA 5개"]
    }
  ],
  "thumbnailCopy": ["썸네일 문구 30개"],
  "commentHooks": ["댓글 유도 문구 25개"],
  "nextVideoIdeas": ["다음에 찍을 영상 아이디어 40개"]
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "너는 한국어 숏폼 벤치마킹 분석 전문가다. 반드시 풍부하고 실전적인 JSON만 출력한다." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.85
    });

    const content = completion.choices[0].message.content || "{}";
    let result: any = {};
    try {
      result = JSON.parse(content);
    } catch {
      result = safeFallback(keyword);
    }

    result.youtubeStatus = result.youtubeStatus || yt.status;
    result.systemStatus = result.systemStatus || "분석 완료";
    if (!result.collectedVideos || !result.collectedVideos.length) {
      result.collectedVideos = yt.videos.map((v: any) => ({
        title: v.title,
        channelTitle: v.channelTitle,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        url: v.url
      }));
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
