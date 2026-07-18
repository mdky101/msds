"use client";

import { useRef, useState } from "react";
import { shrinkImage } from "@/lib/resize";
import type { AnalyzeResult } from "@/lib/types";
import MsdsFinder from "./MsdsFinder";
import VerdictCard from "./VerdictCard";

type State =
  | { phase: "idle" }
  | { phase: "reading"; preview: string }
  | { phase: "done"; preview: string; result: AnalyzeResult }
  | { phase: "error"; preview: string | null; message: string; isLimit: boolean };

export default function Scanner() {
  const [state, setState] = useState<State>({ phase: "idle" });
  // 사진 없이 제품명으로만 검색하는 모드. 검색은 Gemini를 안 쓰므로 판독 한도가
  // 차도 동작한다. 그 우회로다.
  const [manual, setManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const preview = URL.createObjectURL(file);
    setState({ phase: "reading", preview });

    try {
      const shrunk = await shrinkImage(file);
      const body = new FormData();
      body.append("image", shrunk);

      const res = await fetch("/api/analyze", { method: "POST", body });
      const payload = await res.json();

      if (!res.ok) {
        setState({
          phase: "error",
          preview,
          message: payload?.message ?? "판독에 실패했습니다.",
          isLimit: res.status === 429,
        });
        return;
      }
      setState({ phase: "done", preview, result: payload as AnalyzeResult });
    } catch {
      setState({
        phase: "error",
        preview,
        message: "네트워크 오류입니다. 연결을 확인하고 다시 시도해 주세요.",
        isLimit: false,
      });
    }
  }

  function reset() {
    if (state.phase !== "idle" && state.preview) {
      URL.revokeObjectURL(state.preview);
    }
    setState({ phase: "idle" });
    setManual(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (manual) {
    return (
      <div className="space-y-5">
        <div className="border-hairline bg-surface rounded-lg border p-6">
          <h2 className="title-md text-ink">제품명으로 검색</h2>
          <p className="text-ink-muted mt-1 text-sm leading-relaxed">
            사진 없이 국문 MSDS만 찾습니다. 위험도 판정은 라벨을 촬영해야 나옵니다.
          </p>
        </div>
        <MsdsFinder
          initialQuery=""
          casNumbers={[]}
          manufacturer={null}
          photoPictograms={[]}
          standalone
        />
        <button
          type="button"
          onClick={reset}
          className="rounded-md border-hairline bg-surface text-ink-secondary hover:border-ink-faint w-full border py-2.5 text-base font-medium transition-colors"
        >
          라벨 촬영으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {state.phase === "idle" ? (
        // 촬영 전 화면. 캔버스 위에 뜬 흰 카드 하나 — 이 시스템의 기본 도형이다.
        <div className="border-hairline bg-surface rounded-lg flex flex-col items-center gap-5 border px-6 py-14">
          <CameraIcon />
          <p className="text-ink-muted max-w-xs text-center text-[15px] leading-relaxed">
            그림문자와 성분표가 함께 보이도록 찍으면 가장 정확합니다
          </p>
          {/* 이 화면의 유일한 파랑. 파랑이 곧 "여기를 누르시오"다. */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="bg-primary active:bg-primary-active rounded-full px-7 py-3 text-base font-medium text-white transition-transform active:scale-95"
          >
            제품 라벨 촬영하기
          </button>
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-primary-active text-sm font-medium underline underline-offset-4"
          >
            사진 없이 제품명으로 검색
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 사진은 둥근 틀 안에 담긴다 — 이 시스템이 스크린샷을 다루는 방식 그대로다.
              바로 아래 "다시 촬영"을 붙여 결과가 길어져도 스크롤 없이 다시 찍게 한다. */}
          {state.preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={state.preview}
              alt="촬영한 라벨"
              className="border-hairline bg-surface rounded-lg max-h-72 w-full border object-contain"
            />
          )}

          {state.phase !== "reading" && (
            <button
              type="button"
              onClick={reset}
              className="border-hairline bg-surface text-ink rounded-md w-full border py-2.5 text-base font-medium transition-transform active:scale-95"
            >
              다시 촬영하기
            </button>
          )}

          {state.phase === "reading" && <ReadingIndicator />}

          {state.phase === "error" && (
            <div className="border-hairline bg-hazard-danger-soft rounded-lg border p-5">
              <h2 className="text-hazard-danger title-md">
                {state.isLimit ? "오늘 판독 한도를 다 썼습니다" : "판독하지 못했습니다"}
              </h2>
              <p className="text-ink-secondary mt-1 text-[15px] leading-relaxed">
                {state.message}
              </p>
              {/* 판독(Gemini)은 막혔어도 검색은 된다. 그 우회로를 바로 연다. */}
              <p className="text-ink-secondary mt-2 text-sm leading-relaxed">
                사진 판독은 안 되지만, <strong className="font-semibold">제품명을
                입력하면 MSDS는 찾을 수 있습니다.</strong>
              </p>
              <button
                type="button"
                onClick={() => setManual(true)}
                className="bg-primary active:bg-primary-active rounded-full mt-3 px-6 py-2.5 text-[15px] font-medium text-white transition-transform active:scale-95"
              >
                제품명으로 검색하기
              </button>
            </div>
          )}

          {state.phase === "done" && <VerdictCard result={state.result} />}
        </div>
      )}
    </div>
  );
}

function ReadingIndicator() {
  return (
    <div
      role="status"
      className="border-hairline bg-surface rounded-lg flex items-center gap-3 border p-5"
    >
      <span className="border-hairline border-t-primary size-5 animate-spin rounded-full border-2" />
      <span className="text-ink-secondary text-[15px]">
        라벨을 읽는 중입니다…
      </span>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="text-ink-faint size-12"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
      />
    </svg>
  );
}
