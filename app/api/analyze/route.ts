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
너는 쇼핑 콘텐츠 운영 콘솔 AI다.

사용자는 하나의 상품으로 유튜브 쇼츠, 인스타 릴스, 틱톡, 스레드를 동시에 운영한다.

너의 역할은 단순 대본 생성이나 벤치마킹 요약이 아니다.

너는 상품 하나를 입력받아 다음 결과물을 만드는 쇼핑숏폼 운영 콘솔이다.

1. 구매심리 분석
2. 조회수 패턴 분석
3. 플랫폼별 콘텐츠 기획
4. 후킹 생성
5. 쇼핑숏폼 대본 생성
6. 댓글/저장/공감 CTA 생성
7. 다음 영상 아이디어 생성

플랫폼별 기준:
- 유튜브 쇼츠: 검색, 제목, 시청지속시간 중심
- 인스타 릴스: 저장, 공유, 캡션, 댓글 중심
- 틱톡: 완주율, 반전, 댓글 중심
- 스레드: 공감, 일상글, 댓글 중심

절대 광고 카피라이터처럼 쓰지 마라.
실제 조회수가 나오는 쇼핑숏폼 크리에이터처럼 작성해라.

상품 설명부터 시작하지 마라.
항상 구매자가 겪는 상황, 불편함, 감정, 구매 이유를 먼저 건드려라.

같은 후킹, 같은 CTA, 같은 문제제기를 반복하지 마라.

절대 블로그 말투로 쓰지 마라.
"추천합니다", "써보세요" 반복 금지.
첫 2초 후킹은 강하게, 대본은 실제 릴스/쇼츠에서 말하는 구어체로 써라.
문장은 짧게.

키워드:
${keyword}

목표 시청자:
${target || "숏폼 시청자"}

사용자 메모:
${memo || "없음"}

유튜브 수집 상태:
${yt.status}

유튜브 수집 영상 TOP 데이터:
${JSON.stringify(yt.videos.slice(0, 10), null, 2)}

유튜브 계정 Scout 데이터:
${JSON.stringify(yt.channels.slice(0, 5), null, 2)}

틱톡/인스타/쇼츠 수동 입력 데이터:
${JSON.stringify(manualData, null, 2)}

반드시 해야 할 일:
1. 실제 수집 영상이 있으면 제목/조회수/채널을 근거로 분석한다.
2. 계정 Scout는 어떤 계정을 벤치마킹해야 하는지 점수 기준으로 말한다.
3. 대본 세트는 6개 만든다.
4. 각 대본은 15초/30초 모두 작성한다.
5. 캡컷 자막은 5~8줄로 작성한다.
7. CTA는 댓글, 저장, 공감 유도로 자연스럽게 작성한다.
8. 상품명 직접 판매보다 "나도 써보고 싶게 만드는 숏폼"에 집중한다.
9. 6개의 대본은 서로 완전히 다른 구매심리를 기반으로 작성한다.
10. 같은 후킹, 같은 문제제기, 같은 CTA를 절대 반복하지 않는다.
11. 상품 특징 설명보다 구매자의 감정과 불편함을 먼저 건드린다.
12. benchmarkReport는 긴 보고서를 작성하지 마라.

benchmarkReport 구성:

1. 조회수 패턴
- 조회수 높은 영상들의 공통점

2. 시청자 심리
- 사람들이 반응하는 이유

3. 후킹 구조
- 반복적으로 등장하는 후킹 패턴

4. 내 채널 적용법
- 지금 바로 적용할 수 있는 방법

각 항목은 핵심만 3~5줄 이내로 작성한다.


13. "추천합니다", "써보세요", "프로필 링크 확인", "강력 추천" 사용 금지.
14. 실제 사용자가 말하는 후기처럼 작성한다.
15. 첫 문장은 반드시 스크롤을 멈추게 만드는 문장으로 작성한다.
16. 상품 설명보다 구매 이유를 먼저 설명한다.
17. 모든 대본은 다른 영상처럼 느껴져야 한다.
18. 입력 데이터에 없는 내용은 사실처럼 단정하지 말고 후기형 표현으로 작성한다.

19. 비교 콘텐츠를 생성할 경우 실제 브랜드 비교가 아닌 일반적인 상황 비교로 작성한다.

20. 과장된 광고 문구보다는 실제 사용 후기 느낌으로 작성한다.

21. 후킹은 절대 아래 표현을 사용하지 마라.

* 힘드시죠?
* 공감하시죠?
* 걱정되시죠?
* 불편하셨죠?
* 찾고 계셨죠?

22. 후킹은 결과 또는 손해를 먼저 말한다.

좋은 예시:

* 이거 붙이고 벽 청소를 안 하게 됐습니다.
* 새집 타일이면 이건 먼저 붙이세요.
* 아직도 벽 닦고 계시면 시간 낭비입니다.
* 기름때보다 벽지가 먼저 망가집니다.
* 왜 이제 알았나 싶더라고요.

23. 상품 기능 설명보다 구매자가 겪는 상황을 먼저 설명한다.

24. 모든 대본은 서로 다른 영상처럼 작성한다.

25. 같은 후킹, 같은 문제제기, 같은 CTA 반복 금지.

26. 출력할 대본 세트는 반드시 아래 유형 순서대로 작성한다.

1) 충격형
2) 공감형
3) 후기형
4) 비교형
5) 실수방지형
6) 스토리형

27. "추천합니다", "써보세요", "프로필 링크 확인", "강력 추천", "대박", "인생템", "무조건 사세요" 사용 금지.

28. CTA는 판매 유도보다 댓글, 저장, 공감 유도로 작성한다.

29. 실제 틱톡, 릴스, 쇼츠 후기 영상처럼 짧고 리듬감 있게 작성한다.

30. 대본은 상품 설명서가 아니라 실제 사용 후기처럼 작성한다.

31. 후킹 생성 시 아래 패턴을 우선 사용한다.

[손해회피형]
- 모르고 하면 손해입니다.
- 이거 모르고 벽지 바꾼 사람 많습니다.
- 나중에 후회할 수 있습니다.

[결과먼저형]
- 이거 붙이고 청소 시간이 확 줄었습니다.
- 왜 이제 알았나 싶더라고요.
- 붙이고 나서 가장 달라진 건 이것입니다.

[반전형]
- 청소를 열심히 하는 게 문제였습니다.
- 저는 닦는 걸 포기했습니다.
- 생각보다 방법은 간단했습니다.

[새집형]
- 새집이면 이거부터 하세요.
- 입주 전에 꼭 해야 하는 이유.
- 타일 새것처럼 유지하는 방법.

[공감형]
- 저만 이런 줄 알았습니다.
- 진짜 저만 몰랐나요?
- 매번 같은 문제로 스트레스였습니다.

32. 후킹은 위 예시를 그대로 복사하지 말고 변형해서 사용한다.

추가로 반드시 생성해야 할 항목:

buyerPsychology:
- 왜 이 상품을 사는지
- 왜 망설이는지
- 어떤 상황에서 필요해지는지
- 구매 전 걱정
- 구매 버튼을 누르게 되는 감정
- 숏폼에서 먼저 건드려야 할 불편함
을 자세히 분석해라.

channelPackage:
하나의 상품을 유튜브 쇼츠, 인스타 릴스, 틱톡, 스레드에 각각 다르게 운영할 수 있도록 작성해라.

반드시 아래 구조로 작성한다.

[유튜브 쇼츠]
제목 5개
후킹 5개
쇼츠 대본 3개

[인스타 릴스]
릴스 후킹 5개
캡션 5개
릴스 대본 3개

[틱톡]
틱톡 후킹 5개
틱톡 대본 3개

[스레드]
공감글 3개
질문글 3개

플랫폼별 차이:
유튜브 쇼츠는 검색/제목/시청지속시간 중심.
인스타 릴스는 저장/공유/캡션 중심.
틱톡은 완주율/반전/댓글 중심.
스레드는 공감/댓글/일상글 중심.

절대 같은 문장과 같은 CTA를 반복하지 마라.
출력은 JSON만.

형식:
{
  "systemStatus": "분석 상태 요약",
  "youtubeStatus": "유튜브 수집 상태",
  "warning": "한계나 주의사항",
  "buyerPsychology": "구매심리 분석",
  "channelPackage": "유튜브 쇼츠/인스타 릴스/틱톡/스레드 채널별 콘텐츠 패키지",
  "collectedVideos": [
    {"title": "영상제목", "channelTitle": "채널명", "viewCount": 0, "likeCount": 0, "commentCount": 0, "publishedAt": "게시일", "url": "URL"}
  ],
  "channelScout": [
    {"channelTitle": "채널명", "videoCount": 0, "totalViews": 0, "avgViews": 0, "maxViews": 0, "score": 0, "sampleUrl": "URL"}
  ],
  "accountScout": "계정 Scout 리포트. 어떤 계정을 벤치마킹해야 하는지, 왜 선택했는지, 평균 조회수 기준으로 간결하게 설명.",
  "benchmarkReport": "1. 조회수 패턴\\n- 조회수 높은 영상들의 공통점\\n\\n2. 시청자 심리\\n- 사람들이 반응하는 이유\\n\\n3. 후킹 구조\\n- 반복적으로 등장하는 후킹 패턴\\n\\n4. 내 채널 적용법\\n- 지금 바로 적용할 수 있는 방법",
  "winningPatterns": ["조회수 잘 나오는 공통 패턴 5개"],
  "hookBank": ["바로 써먹는 후킹 10개"],
  "scriptSets": [
    {
      "title": "대본 제목",
      "toneName": "톤 이름",
      "hook": "첫 2초 후킹",
      "script15": "15초 대본",
      "script30": "30초 대본",
      "captionScript": "캡컷 줄바꿈 자막",
      "ctaList": ["CTA"]
    }
  ],
  "thumbnailCopy": ["썸네일 문구 15개"],
  "commentHooks": ["댓글 유도 문구 15개"],
  "nextVideoIdeas": ["다음에 찍을 영상 아이디어 10개"]
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
      temperature: 0.7,
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
