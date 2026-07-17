import { assessRisk } from "@/lib/ghs";
import { GeminiError, readLabel } from "@/lib/gemini";
import type { AnalyzeResult, NextStep } from "@/lib/types";
import type { LabelReading } from "@/lib/types";

/** 라벨 판독은 실측 3~7초. Vercel 기본값 10초로는 아슬아슬하다. */
export const maxDuration = 30;

/** 무료 티어 보호. 폰 카메라 사진은 리사이즈 후 보통 1MB 미만이다. */
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "사진을 읽지 못했습니다.");
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return fail(400, "no_image", "사진이 첨부되지 않았습니다.");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return fail(415, "bad_type", "JPEG, PNG, WebP 사진만 판독할 수 있습니다.");
  }
  if (file.size > MAX_BYTES) {
    return fail(413, "too_large", "사진 용량이 너무 큽니다. 다시 촬영해 주세요.");
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let reading: LabelReading;
  try {
    reading = await readLabel(base64, file.type);
  } catch (e) {
    if (e instanceof GeminiError) {
      console.error("[analyze]", e.message);
      return fail(e.status, "vision_failed", e.userMessage);
    }
    console.error("[analyze] unexpected", e);
    return fail(500, "internal", "판독 중 오류가 발생했습니다.");
  }

  const result: AnalyzeResult = {
    reading,
    verdict: assessRisk({
      pictograms: reading.pictograms,
      signalWord: reading.signalWord,
      isChemicalProduct: reading.isChemicalProduct,
    }),
    nextStep: decideNextStep(reading),
  };

  return Response.json(result);
}

/**
 * 다음 행동 안내. CAS를 못 읽었을 때 "찾을 수 없음"으로 끝내면 앱이 쓸모없어 보이지만,
 * 실제로는 성분표가 있는 면을 찍으면 대개 해결된다. 그래서 실패가 아니라 안내로 돌려준다.
 */
function decideNextStep(reading: LabelReading): NextStep {
  if (reading.casNumbers.length > 0) {
    return { kind: "lookup_cas", casNumbers: reading.casNumbers };
  }
  if (!reading.isChemicalProduct || reading.confidence === "low") {
    return {
      kind: "retake",
      why:
        reading.legibilityNote ??
        (reading.isChemicalProduct
          ? "라벨 글자가 선명하게 읽히지 않았습니다."
          : "화학제품 라벨이 사진에 보이지 않습니다."),
    };
  }
  return { kind: "need_ingredient_side", productName: reading.productName };
}

function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}
