/**
 * GHS 그림문자(픽토그램) 정의와 위험도 판정.
 *
 * 이 파일에는 AI가 개입하지 않는다. 비전 모델은 "라벨에 어떤 그림문자가 보이는가"만
 * 답하고, 그것이 얼마나 위험한지는 아래 고정 규칙으로만 결정한다.
 */

export type GhsCode =
  | "GHS01"
  | "GHS02"
  | "GHS03"
  | "GHS04"
  | "GHS05"
  | "GHS06"
  | "GHS07"
  | "GHS08"
  | "GHS09";

export type SignalWord = "위험" | "경고";

/** 위험도 등급. 숫자가 클수록 위험. */
export type RiskLevel = "unknown" | "caution" | "warning" | "danger";

export interface GhsInfo {
  code: GhsCode;
  /** 그림문자 안의 심볼 (해골, 불꽃 등) */
  symbol: string;
  name: string;
  /** 현장 작업자가 바로 이해할 수 있는 한 줄 설명 */
  meaning: string;
  severity: Exclude<RiskLevel, "unknown">;
}

export const GHS_CATALOG: Record<GhsCode, GhsInfo> = {
  GHS01: {
    code: "GHS01",
    symbol: "폭발하는 폭탄",
    name: "폭발성",
    meaning: "충격·마찰·열에 폭발할 수 있음",
    severity: "danger",
  },
  GHS02: {
    code: "GHS02",
    symbol: "불꽃",
    name: "인화성",
    meaning: "불이 잘 붙음. 화기 엄금",
    severity: "danger",
  },
  GHS03: {
    code: "GHS03",
    symbol: "원 위의 불꽃",
    name: "산화성",
    meaning: "다른 물질의 연소를 격렬하게 만듦",
    severity: "danger",
  },
  GHS04: {
    code: "GHS04",
    symbol: "가스 실린더",
    name: "고압가스",
    meaning: "압축·액화 가스. 가열 시 폭발 위험",
    severity: "warning",
  },
  GHS05: {
    code: "GHS05",
    symbol: "부식",
    name: "부식성",
    meaning: "피부·눈에 심한 화상. 금속을 부식시킴",
    severity: "danger",
  },
  GHS06: {
    code: "GHS06",
    symbol: "해골과 뼈",
    name: "급성 독성",
    meaning: "소량으로도 사망하거나 중독될 수 있음",
    severity: "danger",
  },
  GHS07: {
    code: "GHS07",
    symbol: "느낌표",
    name: "경고(자극성)",
    meaning: "피부·눈 자극, 졸음, 어지러움 유발 가능",
    severity: "caution",
  },
  GHS08: {
    code: "GHS08",
    symbol: "인체 실루엣",
    name: "건강 유해성",
    meaning: "발암성·생식독성·장기 손상 등 만성 위험",
    severity: "danger",
  },
  GHS09: {
    code: "GHS09",
    symbol: "죽은 물고기와 나무",
    name: "수생 환경 유해성",
    meaning: "하천·토양 오염. 하수구에 버리지 말 것",
    severity: "caution",
  },
};

export const ALL_GHS_CODES = Object.keys(GHS_CATALOG) as GhsCode[];

const RISK_ORDER: Record<RiskLevel, number> = {
  unknown: 0,
  caution: 1,
  warning: 2,
  danger: 3,
};

export interface RiskVerdict {
  level: RiskLevel;
  /** 화면 상단에 크게 띄울 한 줄 */
  headline: string;
  /** 왜 이 등급인지 — 사용자가 사진과 대조해 검증할 수 있어야 한다 */
  reasons: string[];
}

export interface RiskInput {
  pictograms: GhsCode[];
  signalWord: SignalWord | null;
  isChemicalProduct: boolean;
}

/**
 * 그림문자와 신호어만으로 1차 위험도를 판정한다.
 *
 * 그림문자가 하나도 안 보인다고 해서 안전한 제품이라는 뜻은 아니다.
 * (라벨이 가려졌거나, 덜어 담은 용기이거나, 사진이 흐릴 수 있다)
 * 그래서 "안전"이라는 등급은 존재하지 않고 "정보 부족"까지만 말한다.
 */
export function assessRisk({
  pictograms,
  signalWord,
  isChemicalProduct,
}: RiskInput): RiskVerdict {
  const known = pictograms.filter((code) => code in GHS_CATALOG);
  const reasons: string[] = [];

  let level: RiskLevel = "unknown";

  for (const code of known) {
    const info = GHS_CATALOG[code];
    reasons.push(`${info.name} 그림문자(${info.symbol}) — ${info.meaning}`);
    if (RISK_ORDER[info.severity] > RISK_ORDER[level]) {
      level = info.severity;
    }
  }

  if (signalWord === "위험") {
    reasons.push('신호어 "위험" — 같은 유해성 중에서도 심각한 등급');
    if (RISK_ORDER.danger > RISK_ORDER[level]) level = "danger";
  } else if (signalWord === "경고") {
    reasons.push('신호어 "경고"');
    if (RISK_ORDER.warning > RISK_ORDER[level]) level = "warning";
  }

  if (level === "unknown") {
    reasons.push(
      isChemicalProduct
        ? "라벨에서 GHS 그림문자나 신호어를 읽지 못했습니다"
        : "화학제품 라벨로 보이지 않습니다",
    );
  }

  return { level, headline: HEADLINES[level], reasons };
}

const HEADLINES: Record<RiskLevel, string> = {
  danger: "위험 — 취급 전 MSDS를 반드시 확인하세요",
  warning: "주의 — 보호구 착용이 필요할 수 있습니다",
  caution: "경미한 유해성이 표시되어 있습니다",
  unknown: "판단할 정보가 부족합니다",
};

/** 등급별 화면 색상. Tailwind 클래스를 한곳에서 관리한다. */
export const RISK_STYLE: Record<
  RiskLevel,
  { badge: string; panel: string; label: string }
> = {
  danger: {
    badge: "bg-red-600 text-white",
    panel: "border-red-300 bg-red-50",
    label: "위험",
  },
  warning: {
    badge: "bg-orange-500 text-white",
    panel: "border-orange-300 bg-orange-50",
    label: "주의",
  },
  caution: {
    badge: "bg-amber-400 text-amber-950",
    panel: "border-amber-300 bg-amber-50",
    label: "유의",
  },
  unknown: {
    badge: "bg-slate-500 text-white",
    panel: "border-slate-300 bg-slate-50",
    label: "정보 부족",
  },
};
