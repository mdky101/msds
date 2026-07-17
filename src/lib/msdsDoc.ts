/**
 * MSDS PDF에서 뽑아낸 내용과, 그것을 검증하는 순수 로직.
 *
 * 여기에는 AI가 개입하지 않는다. Gemini는 "PDF에 뭐라고 적혀 있나"만 옮겨 적고,
 * 그게 사용자 손에 든 제품과 맞는지는 아래 규칙으로만 판단한다.
 * 서버·클라이언트가 함께 쓰므로 서버 전용 코드(fetch, 키)를 두지 않는다.
 */

export interface PdfIngredient {
  name: string;
  casNo: string | null;
  content: string | null;
}

export interface MsdsExtract {
  /** PDF에 적힌 제품명. 사용자가 자기 용기와 대조하는 근거 */
  productName: string | null;
  manufacturer: string | null;
  /** PDF에 적힌 개정일 원문 (형식이 제각각이라 문자열 그대로 보관) */
  revisionDate: string | null;
  ingredients: PdfIngredient[];
  /** 글자를 읽어내지 못했으면 false */
  readable: boolean;
  /** readable=false일 때 이유 */
  note: string | null;
}

/**
 * 개정일 원문을 날짜로 바꾼다. 실측한 형식들:
 *   "2018 년 4 월 16 일" / "2022.02.24" / "2016-03-23"
 * 제조사마다 제각각이라 못 읽으면 null을 돌려주고, 화면은 원문을 그대로 보여준다.
 */
export function parseRevisionDate(raw: string | null): Date | null {
  if (!raw) return null;

  const m = /(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/.exec(raw);
  if (!m) return null;

  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, mo - 1, d));
  // 롤오버 검증: 2월 31일 같은 값을 걸러낸다
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * 얼마나 오래된 자료인가.
 *
 * 3년은 법정 기준이 아니라 실무적 어림값이다. MSDS는 변경사항이 생기면 갱신하게
 * 돼 있어서 "몇 년이면 만료"라는 규정이 없다. 다만 실측해보니 웹에 걸린 제조사
 * 공식 PDF가 2016·2018년판이었던 만큼, 오래된 자료라는 사실 자체는 알려야 한다.
 */
const STALE_YEARS = 3;

export interface Staleness {
  years: number | null;
  isStale: boolean;
  /** 화면에 띄울 말. null이면 표시하지 않는다 */
  warning: string | null;
}

export function assessStaleness(
  revisionDate: string | null,
  now: Date,
): Staleness {
  const parsed = parseRevisionDate(revisionDate);
  if (!parsed) {
    return {
      years: null,
      isStale: false,
      warning: revisionDate
        ? null
        : "이 자료의 개정일을 확인하지 못했습니다. 최신판인지 제조사에 확인하세요.",
    };
  }

  const years = (now.getTime() - parsed.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 0) {
    return { years: 0, isStale: false, warning: null };
  }
  if (years < STALE_YEARS) {
    return { years, isStale: false, warning: null };
  }
  return {
    years,
    isStale: true,
    warning: `${Math.floor(years)}년 전(${revisionDate}) 자료입니다. 그 사이 개정됐을 수 있으니 제조사 최신판을 확인하세요.`,
  };
}

export type CasMatch = "match" | "mismatch" | "unknown";

export interface CasCheck {
  status: CasMatch;
  /** 화면에 띄울 말 */
  message: string | null;
  /** 사진에는 있는데 PDF에는 없는 CAS */
  onlyOnLabel: string[];
}

const normalizeCas = (s: string) => s.trim().replace(/\s/g, "");

/**
 * 사진 라벨에서 읽은 CAS와 PDF의 CAS를 대조한다.
 *
 * 이게 이 기능의 안전장치다. 검색이 엉뚱한 제품의 MSDS를 물어와도 CAS가 어긋나면
 * 잡아낼 수 있다. 다만 겹치는 게 하나라도 있으면 통과시킨다 — MSDS는 혼합물의
 * 모든 성분을 싣고, 라벨에는 대표 성분만 적히는 경우가 흔하기 때문이다.
 */
export function crossCheckCas(
  labelCas: string[],
  pdfIngredients: PdfIngredient[],
): CasCheck {
  const label = [...new Set(labelCas.map(normalizeCas).filter(Boolean))];
  const pdf = [
    ...new Set(
      pdfIngredients
        .map((i) => (i.casNo ? normalizeCas(i.casNo) : ""))
        .filter((c) => /^\d{2,7}-\d{2}-\d$/.test(c)),
    ),
  ];

  if (label.length === 0 || pdf.length === 0) {
    return {
      status: "unknown",
      message: null,
      onlyOnLabel: [],
    };
  }

  const overlap = label.filter((c) => pdf.includes(c));
  if (overlap.length > 0) {
    return {
      status: "match",
      message: `사진 라벨의 CAS ${overlap.join(", ")}이(가) 이 자료에도 있습니다.`,
      onlyOnLabel: [],
    };
  }

  return {
    status: "mismatch",
    message: `사진 라벨에서 읽은 CAS(${label.join(", ")})가 이 자료(${pdf.join(", ")})에 없습니다. 다른 제품의 MSDS일 수 있습니다.`,
    onlyOnLabel: label,
  };
}
