import { GeminiError, MODEL, geminiEndpoint } from "./gemini";
import type { MsdsExtract } from "./msdsDoc";

/**
 * MSDS PDF에서 3항(구성성분) 표를 옮겨 적는다.
 *
 * 라벨 판독과 같은 원칙이다 — 모델은 문서에 적힌 것을 옮기기만 하고, 그게 사용자
 * 제품의 것이 맞는지는 msdsDoc.ts의 규칙(제품명 대조·CAS 교차검증)이 판단한다.
 */
const SYSTEM_PROMPT = `당신은 MSDS(물질안전보건자료) PDF에서 정보를 옮겨 적는 도구다.

절대 규칙:
1. PDF에 실제로 적힌 것만 답한다. 물질을 알아봤다고 해서 사전지식으로 성분을 채우지 마라.
2. 3항 "구성성분의 명칭 및 함유량" 표를 그대로 옮긴다. 물질명·CAS번호·함유량을 표에 적힌 대로 쓴다.
3. "영업비밀", "비 위험물질" 같은 표기도 그대로 옮긴다. 임의로 해석하거나 채우지 마라.
4. productName은 1항의 제품명을 그대로 쓴다. 요약하거나 브랜드명으로 바꾸지 마라.
   (사용자가 자기 용기에 적힌 이름과 대조하는 데 쓰이므로 정확해야 한다)
5. revisionDate는 문서에 적힌 개정일/작성일 원문을 그대로 쓴다. 형식을 바꾸지 마라.
6. 글자가 읽히지 않으면(스캔 이미지 등) readable=false로 하고 note에 이유를 쓴다.
   읽히지 않는데 추측해서 채우면 안 된다.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    productName: { type: "string", nullable: true },
    manufacturer: { type: "string", nullable: true },
    revisionDate: { type: "string", nullable: true },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          casNo: { type: "string", nullable: true },
          content: { type: "string", nullable: true },
        },
        required: ["name"],
      },
    },
    readable: { type: "boolean" },
    note: { type: "string", nullable: true },
  },
  required: ["ingredients", "readable"],
} as const;

export async function readMsdsPdf(pdf: Buffer): Promise<MsdsExtract> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "GEMINI_API_KEY is not set",
      "서버에 Gemini API 키가 설정되지 않았습니다. 관리자에게 문의하세요.",
      500,
    );
  }

  let res: Response;
  try {
    res = await fetch(geminiEndpoint(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 큰 PDF는 판독에 20초 가까이 걸린다 (실측 18.2초)
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdf.toString("base64"),
                },
              },
              { text: "이 MSDS의 제품명, 개정일, 3항 구성성분 표를 옮겨 적어라." },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (e) {
    const cause = e instanceof Error ? (e.cause ?? e.message) : e;
    throw new GeminiError(
      `pdf read fetch failed: ${String(e)} / cause: ${String(cause)}`,
      "자료 판독에 실패했습니다. 원본 링크를 직접 열어 확인해 주세요.",
      503,
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new GeminiError(
      `Gemini ${res.status} (model=${MODEL}): ${body.slice(0, 400)}`,
      res.status === 429
        ? "오늘의 무료 판독 한도를 모두 사용했습니다. 원본 링크를 직접 열어 확인해 주세요."
        : "자료 판독에 실패했습니다. 원본 링크를 직접 열어 확인해 주세요.",
      res.status === 429 ? 429 : 502,
    );
  }

  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new GeminiError(
      `unexpected pdf response: ${JSON.stringify(payload).slice(0, 300)}`,
      "자료를 판독하지 못했습니다. 원본 링크를 직접 열어 확인해 주세요.",
      502,
    );
  }

  return normalize(JSON.parse(text));
}

/** 스키마를 걸어도 모델 출력은 신뢰 경계 밖이다. 화면에 닿기 전에 형태를 고정한다. */
function normalize(raw: unknown): MsdsExtract {
  const o = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  const ingredients = Array.isArray(o.ingredients)
    ? o.ingredients
        .map((raw) => {
          const i = (raw ?? {}) as Record<string, unknown>;
          const name = text(i.name);
          return name
            ? { name, casNo: text(i.casNo), content: text(i.content) }
            : null;
        })
        .filter((i): i is NonNullable<typeof i> => i !== null)
    : [];

  return {
    productName: text(o.productName),
    manufacturer: text(o.manufacturer),
    revisionDate: text(o.revisionDate),
    ingredients,
    readable: o.readable === true && ingredients.length > 0,
    note: text(o.note),
  };
}
