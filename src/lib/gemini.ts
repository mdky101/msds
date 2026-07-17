import { ALL_GHS_CODES } from "./ghs";
import type { LabelReading } from "./types";

/**
 * 모델은 은퇴한다. gemini-2.5-flash는 목록 조회에는 계속 뜨지만 신규 사용자의
 * generateContent 호출에는 404를 준다. 코드 수정 없이 갈아탈 수 있도록 환경변수로 뺀다.
 */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

/** 모델명이 여러 곳에 흩어지면 다음 은퇴 때 한쪽만 고치게 된다. 여기서만 만든다. */
export function geminiEndpoint(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * 모델에게 허용된 유일한 작업: 라벨에 보이는 것을 옮겨 적기.
 *
 * 화학물질 이름을 아는 모델은 "아세톤이니까 인화성이겠지"라고 채워 넣으려는
 * 경향이 있다. 그건 사진에 대한 판독이 아니라 기억이고, 틀렸을 때 사용자가
 * 검증할 방법이 없다. 그래서 추론을 금지하고, 안 보이면 비워두게 한다.
 */
const SYSTEM_PROMPT = `당신은 화학제품 라벨을 판독하는 OCR 도구다. 당신의 역할은 "사진에 실제로 보이는 것을 옮겨 적는 것"뿐이다.

절대 규칙:
1. 사진에서 눈으로 확인되는 것만 답한다. 물질에 대한 사전지식으로 빈칸을 채우지 마라.
2. 물질명을 알아봤다고 해서 그 물질의 유해성을 추론해 넣지 마라. 예를 들어 "아세톤"이라고 적혀 있어도, 인화성 그림문자가 사진에 보이지 않으면 pictograms에 GHS02를 넣으면 안 된다.
3. 보이지 않거나 확실하지 않으면 null 또는 빈 배열로 둔다. 추측은 오답보다 위험하다.
4. hazardStatements는 라벨에 인쇄된 문구를 그대로 옮긴다. 요약하거나 바꿔 쓰지 마라.
5. 라벨이 한국어가 아니어도 원문 그대로 옮긴다. 번역하지 마라.

GHS 그림문자는 빨간 마름모 테두리 안에 검은 심볼이 있는 표준 도형이다. 다음만 해당한다:
- GHS01 폭발하는 폭탄
- GHS02 불꽃
- GHS03 원 위의 불꽃
- GHS04 가스 실린더
- GHS05 부식 (액체가 손·금속을 녹이는 그림)
- GHS06 해골과 뼈
- GHS07 느낌표
- GHS08 인체 실루엣 (가슴에 별 모양)
- GHS09 죽은 물고기와 나무

회사 로고, 재활용 마크, 인증 마크는 그림문자가 아니다. 마름모 테두리가 없으면 넣지 마라.

confidence는 글자를 얼마나 선명히 읽었는지로 정한다. 흐리거나 잘렸거나 각도가 심하면 low.
legibilityNote는 confidence가 low일 때만, 사용자가 다시 찍을 때 도움이 될 말을 한 문장으로 쓴다 (예: "빛 반사 때문에 성분표가 읽히지 않습니다").`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    productName: { type: "string", nullable: true },
    manufacturer: { type: "string", nullable: true },
    casNumbers: { type: "array", items: { type: "string" } },
    ingredients: { type: "array", items: { type: "string" } },
    pictograms: {
      type: "array",
      items: { type: "string", enum: ALL_GHS_CODES },
    },
    signalWord: { type: "string", enum: ["위험", "경고"], nullable: true },
    hazardStatements: { type: "array", items: { type: "string" } },
    isChemicalProduct: { type: "boolean" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    legibilityNote: { type: "string", nullable: true },
  },
  required: [
    "casNumbers",
    "ingredients",
    "pictograms",
    "hazardStatements",
    "isChemicalProduct",
    "confidence",
  ],
} as const;

export async function readLabel(
  imageBase64: string,
  mimeType: string,
): Promise<LabelReading> {
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
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: "이 라벨에서 보이는 것을 옮겨 적어라." },
            ],
          },
        ],
        generationConfig: {
          // 판독은 창작이 아니다. 같은 사진이면 같은 답이 나와야 한다.
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (e) {
    // undici는 실제 원인(ECONNRESET, 인증서 오류 등)을 cause에 숨긴다.
    const cause = e instanceof Error ? (e.cause ?? e.message) : e;
    throw new GeminiError(
      `fetch failed: ${String(e)} / cause: ${JSON.stringify(cause, Object.getOwnPropertyNames(Object(cause)))}`,
      "판독 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new GeminiError(
      `Gemini ${res.status} (model=${MODEL}): ${body.slice(0, 500)}`,
      userMessageFor(res.status),
      res.status === 429 ? 429 : 502,
    );
  }

  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new GeminiError(
      `unexpected response shape: ${JSON.stringify(payload).slice(0, 500)}`,
      "라벨을 판독하지 못했습니다. 다시 촬영해 주세요.",
      502,
    );
  }

  return normalize(JSON.parse(text));
}

function userMessageFor(status: number): string {
  if (status === 429) {
    return "오늘의 무료 판독 한도를 모두 사용했습니다. 내일 다시 시도해 주세요.";
  }
  if (status === 404) {
    // 모델 은퇴. 사용자가 뭘 해도 안 고쳐지므로 재시도를 권하지 않는다.
    return "판독 모델 설정에 문제가 있습니다. 관리자에게 문의하세요.";
  }
  if (status === 400) {
    return "사진을 판독할 수 없는 형식입니다. 다시 촬영해 주세요.";
  }
  return "라벨 판독에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 스키마를 걸어도 모델 출력은 신뢰 경계 밖이다. 화면에 닿기 전에 형태를 고정한다.
 */
function normalize(raw: unknown): LabelReading {
  const o = (raw ?? {}) as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];

  const pictograms = strings(o.pictograms).filter(
    (code): code is (typeof ALL_GHS_CODES)[number] =>
      (ALL_GHS_CODES as readonly string[]).includes(code),
  );

  const signalWord =
    o.signalWord === "위험" || o.signalWord === "경고" ? o.signalWord : null;

  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low"
      ? o.confidence
      : "low";

  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  return {
    productName: text(o.productName),
    manufacturer: text(o.manufacturer),
    casNumbers: strings(o.casNumbers).filter(isCasNumber),
    ingredients: strings(o.ingredients),
    pictograms: [...new Set(pictograms)],
    signalWord,
    hazardStatements: strings(o.hazardStatements),
    isChemicalProduct: o.isChemicalProduct === true,
    confidence,
    legibilityNote: text(o.legibilityNote),
  };
}

/** CAS 번호는 2~7자리-2자리-체크디짓 1자리 형식이다. 형식이 틀리면 오독이다. */
function isCasNumber(value: string): boolean {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(value.trim());
  if (!m) return false;

  // 체크디짓 검증: 뒤에서부터 자릿수에 1,2,3...을 곱한 합의 10의 나머지
  const digits = `${m[1]}${m[2]}`.split("").reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
  return sum % 10 === Number(m[3]);
}
