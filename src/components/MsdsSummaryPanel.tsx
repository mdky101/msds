"use client";

import { useState } from "react";
import { GHS_CATALOG, type GhsCode } from "@/lib/ghs";
import { diffPictograms, type MsdsSummary } from "@/lib/msdsSummary";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; summary: MsdsSummary }
  | { phase: "error"; message: string };

export default function MsdsSummaryPanel({
  chemId,
  photoPictograms,
}: {
  chemId: string;
  photoPictograms: GhsCode[];
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function load() {
    setState({ phase: "loading" });
    try {
      const res = await fetch(
        `/api/msds-summary?chemId=${encodeURIComponent(chemId)}`,
      );
      const payload = await res.json();
      if (!res.ok) {
        setState({
          phase: "error",
          message: payload?.message ?? "요약을 불러오지 못했습니다.",
        });
        return;
      }
      setState({ phase: "done", summary: payload as MsdsSummary });
    } catch {
      setState({ phase: "error", message: "네트워크 오류입니다." });
    }
  }

  if (state.phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-md border-hairline bg-surface text-ink-secondary hover:border-ink-faint mt-2.5 w-full border py-2 text-sm font-medium transition-colors"
      >
        요약 보기 (유해성·응급조치·화재·취급·보호구)
      </button>
    );
  }
  if (state.phase === "loading") {
    return (
      <p role="status" className="text-ink-muted mt-2.5 text-xs">
        요약을 불러오는 중…
      </p>
    );
  }
  if (state.phase === "error") {
    return <p className="text-hazard-danger mt-2.5 text-xs">{state.message}</p>;
  }

  return <Summary summary={state.summary} photoPictograms={photoPictograms} />;
}

function Summary({
  summary,
  photoPictograms,
}: {
  summary: MsdsSummary;
  photoPictograms: GhsCode[];
}) {
  const diff = diffPictograms(photoPictograms, summary.officialPictograms);
  const hasDiff = diff.missedOnPhoto.length > 0 || diff.extraOnPhoto.length > 0;

  // 공단에 등재는 됐지만 세부 항목이 비어 있는 물질이 있다.
  // 빈 섹션 5개를 늘어놓느니 없다고 말하는 편이 낫다.
  const isEmpty =
    summary.officialPictograms.length === 0 &&
    summary.sections.every((s) => s.groups.length === 0);

  if (isEmpty) {
    return (
      <p className="bg-canvas rounded-md text-ink-secondary mt-2.5 p-3 text-sm">
        이 물질은 공단에 등록된 세부 자료가 없습니다. «원본 보기»에서 확인하세요.
      </p>
    );
  }

  return (
    <div className="bg-canvas rounded-md mt-2.5 space-y-2.5 p-3">
      {summary.officialPictograms.length > 0 && (
        <div className="bg-surface rounded-xs p-2.5">
          <p className="text-ink-muted text-[11px]">
            공단이 정한 이 물질의 그림문자
            {summary.officialSignalWord && ` · 신호어 «${summary.officialSignalWord}»`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {summary.officialPictograms.map((code) => (
              <li key={code} className="text-xs">
                <span className="text-ink-muted font-mono">{code}</span>{" "}
                <strong className="text-ink font-medium">
                  {GHS_CATALOG[code].name}
                </strong>
                <span className="text-ink-secondary"> — {GHS_CATALOG[code].meaning}</span>
              </li>
            ))}
          </ul>
          {hasDiff && photoPictograms.length > 0 && (
            <p className="border-hazard-warning text-ink-secondary mt-2.5 border-l-2 pl-2.5 text-[11px] leading-relaxed">
              <strong className="text-hazard-warning font-medium">
                사진의 라벨과 다릅니다.
              </strong>
              {diff.missedOnPhoto.length > 0 &&
                ` 공단 자료에는 있으나 사진에서 확인되지 않은 것: ${diff.missedOnPhoto
                  .map((c) => GHS_CATALOG[c].name)
                  .join(", ")}.`}
              {diff.extraOnPhoto.length > 0 &&
                ` 사진에는 있으나 공단 자료에 없는 것: ${diff.extraOnPhoto
                  .map((c) => GHS_CATALOG[c].name)
                  .join(", ")}.`}{" "}
              공단 자료는 순물질 기준이고 제품은 혼합물이라 다를 수 있습니다. 어느
              한쪽이 틀렸다는 뜻은 아닙니다.
            </p>
          )}
        </div>
      )}

      {/* 전부 접어둔다. 위의 그림문자 카드가 이미 한눈에 답을 주고, 5개 항목을
          펼쳐 놓으면 글자 벽이 되어 오히려 안 읽힌다. 여기서는 목차 역할만 한다. */}
      {summary.sections.map((section) => (
        <details key={section.no} className="bg-surface rounded-xs group">
          <summary className="text-ink flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2.5 text-xs font-medium select-none">
            <span className="text-ink-muted font-mono">{section.no}항</span>
            <span>{section.title}</span>
            <span className="text-ink-muted font-normal">
              ({section.groups.length})
            </span>
            <span
              aria-hidden
              className="text-ink-muted ml-auto transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="border-hairline-soft space-y-2.5 border-t px-2.5 py-2.5">
            {section.groups.length === 0 ? (
              <p className="text-ink-muted text-[11px]">등록된 내용이 없습니다.</p>
            ) : (
              section.groups.map((g) => (
                <div key={g.code}>
                  <p className="text-ink-muted text-[11px] font-medium">{g.title}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {g.items.map((item, j) => (
                      <li
                        key={`${g.code}-${j}`}
                        className="text-ink-secondary flex gap-1.5 text-[11px] leading-relaxed"
                      >
                        <span aria-hidden className="text-ink-muted">
                          ·
                        </span>
                        <span className="break-words">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </details>
      ))}

      <p className="text-ink-muted text-[11px] leading-relaxed">
        16개 항목 중 현장에서 자주 쓰는 5개만 추린 것입니다. 내용은 공단 자료 그대로이며
        요약 과정에서 문장을 바꾸지 않았습니다. 나머지 항목은 «원본 보기»에서 확인하세요.
      </p>
    </div>
  );
}
