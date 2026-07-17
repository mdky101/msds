import { GeminiError } from "@/lib/gemini";
import { readMsdsPdf } from "@/lib/geminiPdf";
import { PdfFetchError, fetchPdf } from "@/lib/pdfFetch";
import { assessStaleness, crossCheckCas, type MsdsExtract } from "@/lib/msdsDoc";

/**
 * PDF 내려받기(최대 15초) + Gemini 판독(실측 5~18초, 최대 45초).
 * Vercel 기본값 10초로는 그냥 실패한다.
 */
export const maxDuration = 60;

export interface ReadPdfResult {
  extract: MsdsExtract;
  staleness: ReturnType<typeof assessStaleness>;
  casCheck: ReturnType<typeof crossCheckCas>;
  finalUrl: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "요청을 읽지 못했습니다.");
  }

  const { url, labelCasNumbers } = (body ?? {}) as {
    url?: unknown;
    labelCasNumbers?: unknown;
  };

  if (typeof url !== "string" || !url.trim()) {
    return fail(400, "no_url", "주소가 없습니다.");
  }
  const labelCas = Array.isArray(labelCasNumbers)
    ? labelCasNumbers.filter((c): c is string => typeof c === "string")
    : [];

  try {
    const { bytes, finalUrl } = await fetchPdf(url.trim());
    const extract = await readMsdsPdf(bytes);

    const result: ReadPdfResult = {
      extract,
      staleness: assessStaleness(extract.revisionDate, new Date()),
      casCheck: crossCheckCas(labelCas, extract.ingredients),
      finalUrl,
    };
    return Response.json(result);
  } catch (e) {
    if (e instanceof PdfFetchError || e instanceof GeminiError) {
      console.error("[read-pdf]", e.message);
      return fail(e.status, "read_failed", e.userMessage);
    }
    console.error("[read-pdf] unexpected", e);
    return fail(500, "internal", "자료 판독 중 오류가 발생했습니다.");
  }
}

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}
