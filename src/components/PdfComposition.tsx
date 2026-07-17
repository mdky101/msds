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
        className="rounded-md border-hairline bg-surface text-ink-secondary hover:border-ink-faint mt-2.5 w-full border py-2 text-sm font-medium transition-colors"
      >
        이 자료의 구성성분 보기
      </button>
    );
  }

  if (state.phase === "reading") {
    return (
      <p role="status" className="text-ink-muted mt-2.5 text-xs">
        자료를 읽는 중입니다… (최대 20초)
      </p>
    );
  }

  if (state.phase === "error") {
    return <p className="text-hazard-danger mt-2.5 text-xs">{state.message}</p>;
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
      <div className="bg-canvas rounded-md mt-2.5 p-3">
        <p className="text-ink-secondary text-xs">
          이 자료에서 구성성분을 읽지 못했습니다.
          {extract.note && ` ${extract.note}`}
        </p>
        <p className="text-ink-muted mt-1 text-xs">
          원본 링크를 직접 열어 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-canvas rounded-md mt-2.5 space-y-2.5 p-3">
      {/* 이 자료가 무엇인지부터 밝힌다. 사용자가 손에 든 용기와 대조해야 한다. */}
      <div className="bg-surface rounded-xs p-2.5">
        <p className="text-ink-muted text-[11px]">이 자료의 제품명</p>
        <p className="text-ink font-medium break-words">
          {extract.productName ?? "(문서에 제품명이 없습니다)"}
        </p>
        <p className="text-ink-muted mt-1 text-xs">
          {extract.manufacturer && `${extract.manufacturer} · `}
          개정일 {extract.revisionDate ?? "미상"}
        </p>
        {labelProductName && (
          <p className="text-ink-secondary mt-1.5 text-[11px] leading-relaxed">
            사진에서 읽은 제품명:{" "}
            <strong className="text-ink font-medium">{labelProductName}</strong> —
            두 이름이 같은 제품인지 확인하세요.
          </p>
        )}
      </div>

      {casCheck.status === "mismatch" && (
        <Alert tone="danger" title="다른 제품의 자료일 수 있습니다">
          {casCheck.message}
        </Alert>
      )}
      {casCheck.status === "match" && (
        <p className="text-success text-[11px]">✓ {casCheck.message}</p>
      )}
      {staleness.warning && (
        <Alert
          tone="warning"
          title={staleness.isStale ? "오래된 자료" : "개정일 미확인"}
        >
          {staleness.warning}
        </Alert>
      )}

      <div>
        <p className="text-ink-muted mb-1.5 text-[11px] font-medium">
          구성성분 (문서 3항)
        </p>
        <ul className="space-y-px">
          {extract.ingredients.map((ing, i) => (
            <li
              key={`${ing.name}-${i}`}
              className="bg-surface rounded-xs flex flex-wrap items-baseline gap-x-2 px-2.5 py-2 text-[13px]"
            >
              <span className="text-ink font-medium break-words">
                {ing.name}
              </span>
              {ing.casNo && (
                <span className="text-ink-muted font-mono">CAS {ing.casNo}</span>
              )}
              {ing.content && (
                <span className="text-ink ml-auto shrink-0 font-medium">
                  {ing.content}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-ink-muted text-[11px] leading-relaxed">
        위 내용은 원본 PDF에서 옮긴 것입니다. 취급 판단은 원본 전문을 확인한 뒤
        하세요.
      </p>
    </div>
  );
}

/** 경고도 테두리가 아니라 은은한 틴트 면으로 낸다 — 이 시스템의 강조 방식이다. */
function Alert({
  tone,
  title,
  children,
}: {
  tone: "danger" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  const skin =
    tone === "danger"
      ? "bg-hazard-danger-soft text-hazard-danger"
      : "bg-hazard-warning-soft text-hazard-warning";
  return (
    <div className={`rounded-md p-2.5 ${skin}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-ink-secondary mt-0.5 text-[13px] leading-relaxed">
        {children}
      </p>
    </div>
  );
}
