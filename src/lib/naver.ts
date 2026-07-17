/**
 * 네이버 웹문서 검색으로 제조사 공식 SDS/MSDS 페이지를 찾는다.
 *
 * 목표는 "MSDS 원본 PDF 제공"이 아니라 "제조사 공식 SDS 페이지로 안내"다.
 * 실측(2026-07) 근거:
 *  - 네이버는 제조사 PDF를 색인하지 않는다. wd40.asia의 HTML은 잡히지만
 *    media.wd40.asia의 PDF는 어떤 쿼리로도 안 나온다. site: 연산자도 없다.
 *  - 같은 브랜드도 변형마다(Multi-Use / Specialist Degreaser / Dry Lube) MSDS가
 *    다르다. 자동으로 하나를 골라 "당신 제품의 MSDS"라고 띄우면 틀린 자료를 보게 된다.
 *    공식 SDS 목록 페이지로 보내 사용자가 자기 용기의 변형을 고르는 편이 안전하다.
 */

import { gradeSource, isPdf, sortByTrust, type SourceGrade } from "./sourceRank";

const ENDPOINT = "https://openapi.naver.com/v1/search/webkr.json";

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  grade: SourceGrade;
  isPdf: boolean;
  /** 어떤 검색어로 나왔는지 */
  matchedBy: string;
}

export class NaverError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * 실측으로 확인한 규칙:
 *  - 라벨의 정식 제품명 + "MSDS"/"SDS" → 블로그 0/5, 제조사 공식이 상위
 *  - 한글 "물질안전보건자료"를 붙이면 → 네이버가 자사 블로그를 밀어올려 8/10이 블로그
 * 그래서 "물질안전보건자료"는 절대 넣지 않는다.
 */
export function buildWebQueries(
  productName: string,
  manufacturer: string | null,
): string[] {
  const p = productName.trim().replace(/\s+/g, " ");
  if (!p) return [];

  const queries = [`${p} MSDS`, `${p} SDS`];
  if (manufacturer?.trim()) {
    queries.push(`${manufacturer.trim()} ${p} MSDS`);
  }
  return queries;
}

async function query(
  q: string,
  manufacturer: string | null,
  display: number,
): Promise<WebHit[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new NaverError(
      "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not set",
      "서버에 네이버 검색 키가 설정되지 않았습니다. 관리자에게 문의하세요.",
      500,
    );
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("query", q);
  url.searchParams.set("display", String(display));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    const cause = e instanceof Error ? (e.cause ?? e.message) : e;
    throw new NaverError(
      `naver fetch failed: ${String(e)} / cause: ${String(cause)}`,
      "웹 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new NaverError(
      `naver ${res.status}: ${body.slice(0, 300)}`,
      res.status === 429
        ? "오늘의 웹 검색 한도를 모두 사용했습니다. 내일 다시 시도해 주세요."
        : "웹 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      res.status === 429 ? 429 : 502,
    );
  }

  const payload = await res.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items
    .filter((it: unknown) => typeof (it as { link?: unknown })?.link === "string")
    .map((it: { title?: string; link: string; description?: string }) => ({
      title: stripTags(it.title ?? "") || it.link,
      url: it.link,
      snippet: stripTags(it.description ?? ""),
      grade: gradeSource(it.link, manufacturer),
      isPdf: isPdf(it.link),
      matchedBy: q,
    }));
}

/** 네이버는 검색어에 <b> 태그를 씌워서 돌려준다. */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface WebSearchOutcome {
  hits: WebHit[];
  triedQueries: string[];
}

export async function searchWeb(
  productName: string,
  manufacturer: string | null,
  limit = 5,
): Promise<WebSearchOutcome> {
  const queries = buildWebQueries(productName, manufacturer);
  if (queries.length === 0) return { hits: [], triedQueries: [] };

  const byUrl = new Map<string, WebHit>();
  for (const q of queries) {
    for (const hit of await query(q, manufacturer, 10)) {
      // 같은 URL이 여러 쿼리에 잡히면 첫 등장을 유지한다
      if (!byUrl.has(hit.url)) byUrl.set(hit.url, hit);
    }
    // 제조사 공식이 이미 충분히 모였으면 더 부르지 않는다 (무료 한도 절약)
    const official = [...byUrl.values()].filter(
      (h) => h.grade.tier === "official" || h.grade.tier === "government",
    );
    if (official.length >= limit) break;
  }

  return {
    hits: sortByTrust([...byUrl.values()]).slice(0, limit),
    triedQueries: queries,
  };
}
