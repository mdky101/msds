import { KoshaError, searchMsds } from "./kosha";
import {
  SUMMARY_SECTIONS,
  parsePictogramFiles,
  type MsdsSummary,
  type OfficialGhs,
  type SummaryGroup,
  type SummarySection,
} from "./msdsSummary";

const BASE = "https://msds.kosha.or.kr/openapi/service/msdschem";

/** B0402=그림문자, B0404=신호어. 화면에서 특별 취급한다. */
const PICTOGRAM_CODE = "B0402";
const SIGNAL_WORD_CODE = "B0404";

interface RawItem {
  code: string;
  name: string;
  items: string[];
}

async function fetchSection(endpoint: string, chemId: string): Promise<RawItem[]> {
  const key = process.env.KOSHA_SERVICE_KEY;
  if (!key) {
    throw new KoshaError(
      "KOSHA_SERVICE_KEY is not set",
      "서버에 안전보건공단 인증키가 설정되지 않았습니다. 관리자에게 문의하세요.",
      500,
    );
  }

  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("chemId", chemId);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    const cause = e instanceof Error ? (e.cause ?? e.message) : e;
    throw new KoshaError(
      `kosha ${endpoint} fetch failed: ${String(e)} / cause: ${String(cause)}`,
      "안전보건공단 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
  if (!res.ok) {
    throw new KoshaError(
      `kosha ${endpoint} http ${res.status}`,
      "안전보건공단 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }

  return parse(await res.text());
}

function parse(xml: string): RawItem[] {
  const out: RawItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const code = pick(it, "msdsItemCode");
    const name = decodeEntities(pick(it, "msdsItemNameKor"));
    const detail = pick(it, "itemDetail");
    if (!code || !name) continue;

    // itemDetail은 "|" 구분 다중값이고, 빈 조각이 섞여 온다 (실측)
    const items = detail
      .split("|")
      .map((s) => decodeEntities(s))
      .filter((s) => s !== "" && s !== "자료없음");

    out.push({ code, name, items });
  }
  return out;
}

function pick(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? "";
}

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

export async function fetchSummary(chemId: string): Promise<MsdsSummary> {
  // 5개 항목을 동시에 부른다. 순차로 하면 5배 느리다.
  const results = await Promise.all(
    SUMMARY_SECTIONS.map(async (s) => ({
      spec: s,
      raw: await fetchSection(s.endpoint, chemId),
    })),
  );

  let officialPictograms: ReturnType<typeof parsePictogramFiles> = [];
  let officialSignalWord: string | null = null;

  const sections: SummarySection[] = results.map(({ spec, raw }) => {
    const groups: SummaryGroup[] = [];

    for (const item of raw) {
      if (item.code === PICTOGRAM_CODE) {
        officialPictograms = parsePictogramFiles(item.items);
        continue; // 그림문자는 목록이 아니라 아이콘으로 따로 보여준다
      }
      if (item.code === SIGNAL_WORD_CODE) {
        officialSignalWord = item.items[0] ?? null;
        continue;
      }
      // 내용 없는 항목은 제목만 남아 화면을 어지럽힌다
      if (item.items.length === 0) continue;

      groups.push({ code: item.code, title: item.name, items: item.items });
    }

    return { no: spec.no, title: spec.title, groups };
  });

  return { chemId, officialPictograms, officialSignalWord, sections };
}

/**
 * CAS로 물질을 특정해 공단 공식 그림문자·신호어만 가져온다. chemdetail02 한 항목만
 * 필요하므로 fetchSummary보다 가볍다.
 *
 * 사진 판독 흐름에 끼우는 용도라 실패해도 조용히 null을 돌려준다 — 공식 그림문자를
 * 못 얻는다고 판독 자체를 실패시키면 안 된다.
 */
export async function fetchOfficialGhsByCas(
  cas: string,
): Promise<OfficialGhs | null> {
  try {
    // CAS로 chemId를 먼저 찾는다. searchMsds가 CAS 우선 검색을 이미 한다.
    const { hits } = await searchMsds(null, [cas], 1);
    const hit = hits[0];
    if (!hit) return null;

    const raw = await fetchSection("chemdetail02", hit.chemId);
    let pictograms: ReturnType<typeof parsePictogramFiles> = [];
    let signalWord: string | null = null;
    for (const item of raw) {
      if (item.code === PICTOGRAM_CODE) pictograms = parsePictogramFiles(item.items);
      if (item.code === SIGNAL_WORD_CODE) signalWord = item.items[0] ?? null;
    }

    if (pictograms.length === 0 && !signalWord) return null;
    return {
      chemId: hit.chemId,
      nameKor: hit.nameKor,
      casNo: hit.casNo ?? cas,
      pictograms,
      signalWord,
    };
  } catch {
    return null;
  }
}
