import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 남이 준 URL을 서버가 대신 가져오는 건 그 자체로 공격 통로다(SSRF).
 * 공개 서비스이므로 클라이언트가 보낸 주소를 절대 그대로 믿지 않는다:
 * 내부망 주소 차단, PDF만 허용, 크기·시간 제한, 리다이렉트 수동 처리.
 */

export class PdfFetchError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** 사설·예약 대역. 여기로 나가는 요청은 외부 자료 조회일 리가 없다. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // unique local
    if (v6.startsWith("fe80")) return true; // link-local
    // IPv4-mapped (::ffff:10.0.0.1)
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }

  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (클라우드 메타데이터)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // 멀티캐스트·예약
  );
}

async function assertPublicHost(hostname: string): Promise<void> {
  // 호스트명이 곧 IP인 경우 DNS를 거치지 않으므로 직접 본다
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new PdfFetchError(
        `blocked private ip: ${hostname}`,
        "이 주소는 열 수 없습니다.",
        400,
      );
    }
    return;
  }

  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new PdfFetchError(
      `dns lookup failed: ${hostname}`,
      "주소를 찾을 수 없습니다.",
      400,
    );
  }

  // 하나라도 사설이면 거부한다 (DNS 리바인딩 방어)
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new PdfFetchError(
      `blocked private ip for ${hostname}`,
      "이 주소는 열 수 없습니다.",
      400,
    );
  }
}

export interface FetchedPdf {
  bytes: Buffer;
  /** 리다이렉트를 따라간 최종 주소 */
  finalUrl: string;
}

export async function fetchPdf(rawUrl: string): Promise<FetchedPdf> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PdfFetchError("invalid url", "주소 형식이 올바르지 않습니다.", 400);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PdfFetchError(
      `blocked protocol ${url.protocol}`,
      "이 주소는 열 수 없습니다.",
      400,
    );
  }

  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname);

    try {
      res = await fetch(url, {
        // 리다이렉트를 자동으로 따라가면 내부망으로 튕겨도 못 막는다
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "application/pdf,*/*" },
      });
    } catch (e) {
      const cause = e instanceof Error ? (e.cause ?? e.message) : e;
      throw new PdfFetchError(
        `pdf fetch failed: ${String(e)} / cause: ${String(cause)}`,
        "자료를 가져오지 못했습니다. 원본 링크를 직접 열어 확인해 주세요.",
        502,
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url); // 상대 경로 대응
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new PdfFetchError(
          `blocked redirect protocol ${url.protocol}`,
          "이 주소는 열 수 없습니다.",
          400,
        );
      }
      res = null;
      continue;
    }
    break;
  }

  if (!res) {
    throw new PdfFetchError(
      "too many redirects",
      "자료를 가져오지 못했습니다. 원본 링크를 직접 열어 확인해 주세요.",
      502,
    );
  }
  if (!res.ok) {
    throw new PdfFetchError(
      `pdf http ${res.status}`,
      "자료를 가져오지 못했습니다. 원본 링크를 직접 열어 확인해 주세요.",
      502,
    );
  }

  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    throw new PdfFetchError(
      `pdf too large (declared ${declared})`,
      "자료가 너무 큽니다. 원본 링크를 직접 열어 확인해 주세요.",
      413,
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  // content-length를 속일 수 있으므로 실제 크기도 본다
  if (bytes.length > MAX_BYTES) {
    throw new PdfFetchError(
      `pdf too large (actual ${bytes.length})`,
      "자료가 너무 큽니다. 원본 링크를 직접 열어 확인해 주세요.",
      413,
    );
  }
  // content-type 헤더는 못 믿는다. 파일 앞머리로 확인한다.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new PdfFetchError(
      `not a pdf (magic=${bytes.subarray(0, 8).toString("latin1")})`,
      "이 링크는 PDF 문서가 아닙니다. 원본 링크를 직접 열어 확인해 주세요.",
      415,
    );
  }

  return { bytes, finalUrl: url.toString() };
}
