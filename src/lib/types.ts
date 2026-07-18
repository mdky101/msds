import type { GhsCode, RiskVerdict, SignalWord } from "./ghs";
import type { OfficialGhs } from "./msdsSummary";

/**
 * 사진 속 라벨에서 "읽어낸" 것. 추론이나 모델의 사전지식이 아니라
 * 사용자가 사진과 대조해 검증할 수 있는 내용만 담긴다.
 */
export interface LabelReading {
  productName: string | null;
  manufacturer: string | null;
  /** 라벨에 인쇄된 CAS 번호 (예: "67-64-1") */
  casNumbers: string[];
  /** 성분표에 적힌 물질명 */
  ingredients: string[];
  pictograms: GhsCode[];
  signalWord: SignalWord | null;
  /** 유해·위험문구. 라벨 원문 그대로 */
  hazardStatements: string[];
  isChemicalProduct: boolean;
  /** 모델이 라벨을 얼마나 선명하게 읽었는지 */
  confidence: "high" | "medium" | "low";
  /** 글자가 거의 안 읽힐 때 사용자에게 안내할 말 */
  legibilityNote: string | null;
}

export interface AnalyzeResult {
  reading: LabelReading;
  verdict: RiskVerdict;
  /** 다음에 무엇을 하면 되는지 (성분표 촬영 유도 등) */
  nextStep: NextStep;
  /**
   * CAS가 읽혔고 공단에 등재된 경우, 그 물질의 공식 그림문자·신호어.
   * 사진에서 인식한 것보다 권위 있는 값이라 판정 아래에 함께 보여준다.
   * 못 찾으면 null (판독 자체는 정상).
   */
  officialGhs: OfficialGhs | null;
}

export type NextStep =
  | { kind: "lookup_cas"; casNumbers: string[] }
  | { kind: "need_ingredient_side"; productName: string | null }
  | { kind: "retake"; why: string };

export interface ApiError {
  error: string;
  /** 사용자에게 그대로 보여줄 한국어 메시지 */
  message: string;
}
