import { KoshaError, searchMsds } from "@/lib/kosha";

/** CAS + 이름 사다리로 KOSHA를 최대 4번 순차 호출한다(각 10초 제한). */
export const maxDuration = 45;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "요청을 읽지 못했습니다.");
  }

  const { query, casNumbers } = (body ?? {}) as {
    query?: unknown;
    casNumbers?: unknown;
  };

  const name = typeof query === "string" ? query.trim() : "";
  const cas = Array.isArray(casNumbers)
    ? casNumbers.filter((c): c is string => typeof c === "string")
    : [];

  if (!name && cas.length === 0) {
    return fail(400, "empty_query", "검색어를 입력해 주세요.");
  }
  if (name.length > 100) {
    return fail(400, "query_too_long", "검색어가 너무 깁니다.");
  }

  try {
    return Response.json(await searchMsds(name || null, cas));
  } catch (e) {
    if (e instanceof KoshaError) {
      console.error("[search-msds]", e.message);
      return fail(e.status, "kosha_failed", e.userMessage);
    }
    console.error("[search-msds] unexpected", e);
    return fail(500, "internal", "조회 중 오류가 발생했습니다.");
  }
}

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}
