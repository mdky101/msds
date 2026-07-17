import { NaverError, searchWeb } from "@/lib/naver";

/** 네이버 쿼리를 최대 3개 던진다(각 8초 제한). */
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "요청을 읽지 못했습니다.");
  }

  const { query, manufacturer } = (body ?? {}) as {
    query?: unknown;
    manufacturer?: unknown;
  };

  const name = typeof query === "string" ? query.trim() : "";
  const mfr =
    typeof manufacturer === "string" && manufacturer.trim()
      ? manufacturer.trim()
      : null;

  if (!name) return fail(400, "empty_query", "검색어를 입력해 주세요.");
  if (name.length > 100) return fail(400, "query_too_long", "검색어가 너무 깁니다.");

  try {
    return Response.json(await searchWeb(name, mfr));
  } catch (e) {
    if (e instanceof NaverError) {
      console.error("[search-web]", e.message);
      return fail(e.status, "naver_failed", e.userMessage);
    }
    console.error("[search-web] unexpected", e);
    return fail(500, "internal", "검색 중 오류가 발생했습니다.");
  }
}

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}
