import { KoshaError } from "@/lib/kosha";
import { fetchSummary } from "@/lib/koshaDetail";

/** 5개 항목을 병렬 조회한다(각 10초 제한). 실측 0.1~0.8초. */
export const maxDuration = 20;

export async function GET(request: Request): Promise<Response> {
  const chemId = new URL(request.url).searchParams.get("chemId")?.trim();

  // chemId는 KOSHA가 준 값(예: "001067")만 온다. 형식이 다르면 우리가 만든 값이 아니다.
  if (!chemId || !/^\d{1,10}$/.test(chemId)) {
    return Response.json(
      { error: "bad_chem_id", message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  try {
    return Response.json(await fetchSummary(chemId));
  } catch (e) {
    if (e instanceof KoshaError) {
      console.error("[msds-summary]", e.message);
      return Response.json(
        { error: "kosha_failed", message: e.userMessage },
        { status: e.status },
      );
    }
    console.error("[msds-summary] unexpected", e);
    return Response.json(
      { error: "internal", message: "요약을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
