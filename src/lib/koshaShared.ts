/**
 * 서버·클라이언트가 함께 쓰는 KOSHA 관련 값. 서버 전용 코드(인증키, fetch)는
 * kosha.ts에 두고 이 파일에는 두지 않는다 — 브라우저 번들에 섞이면 안 된다.
 */

/** KOSHA MSDS 상세 화면. GET이 아니라 POST 폼이라 링크로 못 걸고 폼 전송이 필요하다. */
export const KOSHA_DETAIL_URL =
  "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do";
export const KOSHA_DETAIL_VIEW_TYPE = "msds";

export interface ChemHit {
  chemId: string;
  casNo: string | null;
  nameKor: string;
  /** 자료 최종 갱신일 */
  lastDate: string | null;
  /** 어떤 검색어로 찾았는지 — 사용자가 결과를 납득할 수 있게 */
  matchedBy: string;
}

export interface SearchOutcome {
  hits: ChemHit[];
  /** 실제로 결과를 만든 검색어. 화면에 "'아세톤'(으)로 찾았습니다"라고 보여준다. */
  usedQuery: string | null;
  /** 시도했지만 0건이었던 검색어들 */
  triedQueries: string[];
}
