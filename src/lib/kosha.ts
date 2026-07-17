/**
 * 안전보건공단(KOSHA) 화학물질정보 오픈API.
 * https://www.data.go.kr/data/15157612/openapi.do
 *
 * 이 API는 "물질" 단위다. 상표명 제품(예: WD-40)은 나오지 않고 물질명/CAS로만 찾힌다.
 * 대신 나오는 자료는 법정 국문 MSDS라 신뢰도가 가장 높다.
 */

import type { ChemHit, SearchOutcome } from "./koshaShared";

const BASE = "https://msds.kosha.or.kr/openapi/service/msdschem";

export class KoshaError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const SEARCH_BY_NAME = 0;
const SEARCH_BY_CAS = 1;

async function chemlist(
  searchWrd: string,
  searchCnd: number,
  rows: number,
): Promise<ChemHit[]> {
  const key = process.env.KOSHA_SERVICE_KEY;
  if (!key) {
    throw new KoshaError(
      "KOSHA_SERVICE_KEY is not set",
      "서버에 안전보건공단 인증키가 설정되지 않았습니다. 관리자에게 문의하세요.",
      500,
    );
  }

  const url = new URL(`${BASE}/chemlist`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("searchWrd", searchWrd);
  url.searchParams.set("searchCnd", String(searchCnd));
  url.searchParams.set("numOfRows", String(rows));
  url.searchParams.set("pageNo", "1");

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    const cause = e instanceof Error ? (e.cause ?? e.message) : e;
    throw new KoshaError(
      `kosha fetch failed: ${String(e)} / cause: ${String(cause)}`,
      "안전보건공단 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  if (!res.ok) {
    throw new KoshaError(
      `kosha ${res.status}`,
      "안전보건공단 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }

  const xml = await res.text();

  const code = pick(xml, "resultCode");
  if (code && code !== "00") {
    // 인증키 만료·미등록도 여기로 온다. 사용자가 할 수 있는 게 없으므로 관리자 안내.
    throw new KoshaError(
      `kosha resultCode=${code} msg=${pick(xml, "resultMsg")}`,
      "안전보건공단 조회에 실패했습니다. 관리자에게 문의하세요.",
      502,
    );
  }

  return parseItems(xml, searchWrd);
}

function parseItems(xml: string, matchedBy: string): ChemHit[] {
  const hits: ChemHit[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const chemId = pick(item, "chemId");
    const nameKor = pick(item, "chemNameKor");
    if (!chemId || !nameKor) continue;
    hits.push({
      chemId,
      casNo: pick(item, "casNo") || null,
      nameKor: decodeEntities(nameKor),
      lastDate: pick(item, "lastDate") || null,
      matchedBy,
    });
  }
  return hits;
}

function pick(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? "";
}

/** KOSHA 응답에는 &lt;br/&gt; 같은 엔티티가 그대로 들어있다. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;br\s*\/?&gt;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const CAS_RE = /^\d{2,7}-\d{2}-\d$/;

/**
 * 사진에서 읽은 제품명은 "아세톤 99.5%", "톨루엔(공업용) 20L"처럼 부가정보가 붙어 있다.
 * KOSHA는 부분일치가 아니라 이런 문자열을 그대로 넣으면 0건이 나오므로, 넓은 검색어부터
 * 좁혀가며 시도한다.
 */
export function buildQueryLadder(raw: string): string[] {
  const q = raw.trim();
  const ladder: string[] = [];
  const push = (s: string) => {
    const v = s.trim();
    if (v.length >= 2 && !ladder.includes(v)) ladder.push(v);
  };

  push(q);

  // 농도·용량·괄호주석 제거: "아세톤 99.5%" → "아세톤"
  const cleaned = q
    .replace(/\([^)]*\)/g, " ")
    .replace(/[\d.]+\s*(%|퍼센트|ml|mL|L|리터|kg|g|호)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  push(cleaned);

  // 그래도 길면 가장 긴 낱말 하나로 (보통 물질명)
  const longest = cleaned
    .split(/\s+/)
    .filter((w) => !/^\d+$/.test(w))
    .sort((a, b) => b.length - a.length)[0];
  if (longest) push(longest);

  return ladder;
}

/**
 * CAS가 있으면 그걸로 먼저 찾는다. 이름 검색은 동음이의어가 섞이지만 CAS는 물질을 특정한다.
 */
export async function searchMsds(
  productName: string | null,
  casNumbers: string[] = [],
  limit = 5,
): Promise<SearchOutcome> {
  const tried: string[] = [];
  const collected = new Map<string, ChemHit>();

  for (const cas of casNumbers) {
    if (!CAS_RE.test(cas)) continue;
    tried.push(cas);
    for (const hit of await chemlist(cas, SEARCH_BY_CAS, limit)) {
      if (!collected.has(hit.chemId)) collected.set(hit.chemId, hit);
    }
    if (collected.size >= limit) {
      return finish(collected, casNumbers[0], tried, limit);
    }
  }

  const query = productName?.trim() ?? "";
  if (query) {
    // 사용자가 CAS를 직접 입력했을 수도 있다
    if (CAS_RE.test(query)) {
      tried.push(query);
      for (const hit of await chemlist(query, SEARCH_BY_CAS, limit)) {
        if (!collected.has(hit.chemId)) collected.set(hit.chemId, hit);
      }
      if (collected.size > 0) return finish(collected, query, tried, limit);
    }

    for (const q of buildQueryLadder(query)) {
      tried.push(q);
      const hits = await chemlist(q, SEARCH_BY_NAME, limit);
      if (hits.length > 0) {
        for (const hit of hits) {
          if (!collected.has(hit.chemId)) collected.set(hit.chemId, hit);
        }
        return finish(collected, q, tried, limit);
      }
    }
  }

  return finish(collected, collected.size > 0 ? tried[0] : null, tried, limit);
}

function finish(
  collected: Map<string, ChemHit>,
  usedQuery: string | null,
  tried: string[],
  limit: number,
): SearchOutcome {
  return {
    hits: [...collected.values()].slice(0, limit),
    usedQuery: collected.size > 0 ? usedQuery : null,
    triedQueries: [...new Set(tried)],
  };
}
