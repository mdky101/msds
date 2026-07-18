import type { GhsCode } from "./ghs";
import { ALL_GHS_CODES } from "./ghs";

/**
 * KOSHA MSDS 요약에 쓰는 타입과 순수 파싱. 서버·클라이언트 공용.
 *
 * "요약"은 16개 항목 중 현장에서 당장 필요한 5개만 고르는 것이다.
 * 고른 항목 안에서 내용을 더 잘라내지는 않는다 — 하필 잘린 줄이 그날 필요한
 * 조치일 수 있고, 그건 분량을 아끼자고 감수할 위험이 아니다.
 */

/** 현장에서 당장 필요한 순서대로. 숫자는 법정 16항 서식의 항목 번호. */
export const SUMMARY_SECTIONS = [
  { endpoint: "chemdetail02", no: 2, title: "유해성·위험성" },
  { endpoint: "chemdetail04", no: 4, title: "응급조치 요령" },
  { endpoint: "chemdetail05", no: 5, title: "폭발·화재 시 대처방법" },
  { endpoint: "chemdetail07", no: 7, title: "취급 및 저장방법" },
  { endpoint: "chemdetail08", no: 8, title: "노출방지 및 개인보호구" },
] as const;

export interface SummaryGroup {
  code: string;
  title: string;
  items: string[];
}

export interface SummarySection {
  no: number;
  title: string;
  groups: SummaryGroup[];
}

export interface MsdsSummary {
  chemId: string;
  /** KOSHA가 제시하는 공식 GHS 그림문자. 사진 판독과 대조할 수 있다. */
  officialPictograms: GhsCode[];
  officialSignalWord: string | null;
  sections: SummarySection[];
}

/**
 * CAS로 특정한 물질의 공단 공식 GHS 정보. 사진에서 작은 그림문자를 인식하는 대신,
 * 큰 글씨인 CAS를 읽어 정부 공식 그림문자를 가져오는 경로에 쓴다.
 */
export interface OfficialGhs {
  chemId: string;
  nameKor: string;
  casNo: string;
  pictograms: GhsCode[];
  signalWord: string | null;
}

/** KOSHA는 그림문자를 "GHS02.gif|GHS07.gif|GHS08.gif"처럼 파일명으로 준다. */
export function parsePictogramFiles(items: string[]): GhsCode[] {
  const codes = items
    .map((s) => /^(GHS\d{2})\.gif$/i.exec(s.trim())?.[1]?.toUpperCase())
    .filter((c): c is string => Boolean(c))
    .filter((c): c is GhsCode => (ALL_GHS_CODES as readonly string[]).includes(c));
  return [...new Set(codes)];
}

/** 사진에서 읽은 그림문자와 KOSHA 공식 그림문자의 차이. */
export interface PictogramDiff {
  /** 공식에는 있는데 사진에서 못 본 것 */
  missedOnPhoto: GhsCode[];
  /** 사진에서 봤는데 공식에는 없는 것 */
  extraOnPhoto: GhsCode[];
}

/**
 * 차이가 있다고 해서 어느 한쪽이 틀린 건 아니다. KOSHA는 순물질 기준이고 제품은
 * 혼합물이라 라벨 그림문자가 다를 수 있다. 그래서 "틀렸다"가 아니라 "다르다"로만
 * 알린다.
 */
export function diffPictograms(
  fromPhoto: GhsCode[],
  official: GhsCode[],
): PictogramDiff {
  return {
    missedOnPhoto: official.filter((c) => !fromPhoto.includes(c)),
    extraOnPhoto: fromPhoto.filter((c) => !official.includes(c)),
  };
}
