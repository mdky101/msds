/**
 * 웹에서 찾은 MSDS의 출처 등급.
 *
 * 웹 검색은 제조사 공식 PDF와 함께 Scribd, 개인 블로그, 대리점 사본을 같이 물어온다.
 * 2차 출처의 MSDS는 구버전이거나 규격이 다른 제품일 수 있는데, 화면에서 똑같이 보이면
 * 사용자가 2019년판을 최신 자료로 오인한다. 그래서 등급을 매겨 표시한다.
 *
 * 검색 API에 의존하지 않는 순수 함수다 (네이버든 Gemini든 결과 URL만 있으면 된다).
 */

export type SourceTier = "government" | "official" | "vendor" | "aggregator";

export interface SourceGrade {
  tier: SourceTier;
  /** 화면 배지 문구 */
  label: string;
  /** 왜 이 등급인지 — 사용자가 납득할 수 있어야 한다 */
  note: string;
  /** 정렬용. 작을수록 위 */
  rank: number;
}

/** 원문을 그대로 싣지 않고 사용자 업로드로 굴러다니는 곳. 출처·판번호를 신뢰할 수 없다. */
const AGGREGATORS = [
  "scribd.com",
  "slideshare.net",
  "studylib.net",
  "dokumen.pub",
  "vdocuments.net",
  "coursehero.com",
  "academia.edu",
  "docslib.org",
  "yumpu.com",
  "issuu.com",
];

/** 개인이 정리해 올린 자료. 성의는 있지만 개정 추적이 안 된다. */
const BLOG_HOSTS = [
  "tistory.com",
  "blog.naver.com",
  "blog.daum.net",
  "velog.io",
  "wordpress.com",
  "blogspot.com",
  "brunch.co.kr",
  "medium.com",
  "cafe.naver.com",
  "cafe.daum.net",
  "rusty21.com",
];

const GOV_HOSTS = ["kosha.or.kr", "moel.go.kr", "me.go.kr", "nier.go.kr", "data.go.kr"];

const GRADES: Record<SourceTier, Omit<SourceGrade, "note">> = {
  government: { tier: "government", label: "정부 공식", rank: 0 },
  official: { tier: "official", label: "제조사 공식", rank: 1 },
  vendor: { tier: "vendor", label: "출처 미확인", rank: 2 },
  aggregator: { tier: "aggregator", label: "2차 출처", rank: 3 },
};

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, needles: string[]): boolean {
  return needles.some((n) => host === n || host.endsWith(`.${n}`));
}

/**
 * 제조사명과 도메인을 대조한다. "WD-40 Company" ↔ wd40.asia, "SK케미칼" ↔ skchemicals.com
 * 처럼 표기가 제각각이라 완벽할 수 없다. 확신이 없으면 official로 올리지 않는다 —
 * 잘못 올리면 2차 출처가 공식으로 둔갑한다.
 */
function looksOfficial(host: string, manufacturer: string | null): boolean {
  if (!manufacturer) return false;

  const hostCore = host.replace(/[.-]/g, "");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

  // 회사명 통째로: "SK chemicals" → skchemicals ⊂ skchemicalscom
  // 불용어를 지우면 "sk"만 남아 놓치므로, 지우기 전에 먼저 본다.
  const whole = norm(manufacturer);
  if (whole.length >= 4 && hostCore.includes(whole)) return true;

  // 낱말별: "WD-40 Company" → wd40 ⊂ mediawd40asia
  // chemical/화학 같은 흔한 낱말은 뺀다 — 남겨두면 아무 화학회사 도메인에나 걸려
  // 2차 출처가 "제조사 공식"으로 둔갑한다.
  const tokens = manufacturer
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(
      /\b(주식회사|주|㈜|co|ltd|inc|corp|corporation|company|kr|korea|chemical|chemicals|화학|케미칼)\b/g,
      " ",
    )
    .split(/[\s.,·]+/)
    .map(norm)
    .filter((t) => t.length >= 3);

  return tokens.some((t) => hostCore.includes(t));
}

export function gradeSource(url: string, manufacturer: string | null): SourceGrade {
  const host = hostOf(url);
  if (!host) {
    return { ...GRADES.aggregator, note: "주소를 확인할 수 없습니다" };
  }

  if (hostMatches(host, GOV_HOSTS)) {
    return { ...GRADES.government, note: `${host} — 정부 기관 자료` };
  }
  if (hostMatches(host, AGGREGATORS)) {
    return {
      ...GRADES.aggregator,
      note: `${host} — 누구나 올릴 수 있는 문서 공유 사이트. 판번호·출처를 신뢰할 수 없습니다`,
    };
  }
  if (hostMatches(host, BLOG_HOSTS)) {
    return {
      ...GRADES.aggregator,
      note: `${host} — 개인이 정리한 자료. 원본 개정 여부를 확인하세요`,
    };
  }
  if (looksOfficial(host, manufacturer)) {
    return { ...GRADES.official, note: `${host} — 제조사 도메인으로 보입니다` };
  }
  return {
    ...GRADES.vendor,
    note: `${host} — 제조사 공식 여부를 확인하지 못했습니다`,
  };
}

/** 등급 우선, 같은 등급이면 PDF 우선(원본일 가능성이 높다), 그다음 원래 검색 순위. */
export function sortByTrust<T extends { url: string; grade: SourceGrade }>(
  items: T[],
): T[] {
  return [...items]
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      if (a.item.grade.rank !== b.item.grade.rank) {
        return a.item.grade.rank - b.item.grade.rank;
      }
      const pdf = Number(isPdf(b.item.url)) - Number(isPdf(a.item.url));
      return pdf !== 0 ? pdf : a.i - b.i;
    })
    .map(({ item }) => item);
}

export function isPdf(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}
