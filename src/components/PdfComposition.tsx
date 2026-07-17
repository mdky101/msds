"use client";

import { useState } from "react";
import type { CasCheck, MsdsExtract, Staleness } from "@/lib/msdsDoc";

interface ReadPdfResult {
  extract: MsdsExtract;
  staleness: Staleness;
  casCheck: CasCheck;
  finalUrl: string;
}

type State =
  | { phase: "idle" }
  | { phase: "reading" }
  | { phase: "done"; result: ReadPdfResult }
  | { phase: "error"; message: string };

export default function PdfComposition({
  url,
  labelCasNumbers,
  labelProductName,
}: {
  url: string;
  labelCasNumbers: string[];
  labelProductName: string | null;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function read() {
    setState({ phase: "reading" });
    try {
      const res = await fetch("/api/read-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, labelCasNumbers }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setState({
          phase: "error",
          message: payload?.message ?? "판독에 실패했습니다.",
        });
        return;
      }
      setState({ phase: "done", result: payload as ReadPdfResult });
    } catch {
      setState({ phase: "error", message: "네트워크 오류입니다." });
    }
  }

  if (state.phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => void read()}
        className="mt-2 w-full rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50"
      >
        이 자료의 구성성분 보기
      </button>
    );
  }

  if (state.phase === "reading") {
    return (
      <p role="status" className="mt-2 text-xs text-slate-500">
        자료를 읽는 중입니다… (최대 20초)
      </p>
    );
  }

  if (state.phase === "error") {
    return <p className="mt-2 text-xs text-red-700">{state.message}</p>;
  }

  return <Composition result={state.result} labelProductName={labelProductName} />;
}

function Composition({
  result,
  labelProductName,
}: {
  result: ReadPdfResult;
  labelProductName: string | null;
}) {
  const { extract, staleness, casCheck } = result;

  if (!extract.readable) {
    return (
      <div className="mt-2 rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-700">
          이 자료에서 구성성분을 읽지 못했습니다.
          {extract.note && ` ${extract.note}`}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          원본 링크를 직접 열어 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {/* 이 자료가 무엇인지부터 밝힌다. 사용자가 손에 든 용기와 대조해야 한다. */}
      <div className="rounded-md bg-white p-2.5">
        <p className="text-[11px] text-slate-500">이 자료의 제품명</p>
        <p className="font-semibold break-words text-slate-900">
          {extract.productName ?? "(문서에 제품명이 없습니다)"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {extract.manufacturer && `${extract.manufacturer} · `}
          개정일 {extract.revisionDate ?? "미상"}
        </p>
        {labelProductName && (
          <p className="mt-1.5 text-[11px] text-slate-600">
            사진에서 읽은 제품명:{" "}
            <strong className="text-slate-800">{labelProductName}</strong> — 두
            이름이 같은 제품인지 확인하세요.
          </p>
        )}
      </div>

      {casCheck.status === "mismatch" && (
        <Alert tone="red" title="다른 제품의 자료일 수 있습니다">
          {casCheck.message}
        </Alert>
      )}
      {casCheck.status === "match" && (
        <p className="text-[11px] text-emerald-700">✓ {casCheck.message}</p>
      )}
      {staleness.warning && (
        <Alert tone="amber" title={staleness.isStale ? "오래된 자료" : "개정일 미확인"}>
          {staleness.warning}
        </Alert>
      )}

      <div>
        <p className="mb-1 text-[11px] font-semibold text-slate-600">
          구성성분 (문서 3항)
        </p>
        <ul className="space-y-1">
          {extract.ingredients.map((ing, i) => (
            <li
              key={`${ing.name}-${i}`}
              className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-white px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium break-words text-slate-900">
                {ing.name}
              </span>
              {ing.casNo && (
                <span className="font-mono text-slate-500">CAS {ing.casNo}</span>
              )}
              {ing.content && (
                <span className="ml-auto shrink-0 font-semibold text-slate-700">
                  {ing.content}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        위 내용은 원본 PDF에서 옮긴 것입니다. 취급 판단은 원본 전문을 확인한 뒤
        하세요.
      </p>
    </div>
  );
}

function Alert({
  tone,
  title,
  children,
}: {
  tone: "red" | "amber";
  title: string;
  children: React.ReactNode;
}) {
  const style =
    tone === "red"
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-md border p-2.5 ${style}`}>
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed">{children}</p>
    </div>
  );
}
