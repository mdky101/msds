"use client";

import { useRef, useState } from "react";
import { shrinkImage } from "@/lib/resize";
import type { AnalyzeResult } from "@/lib/types";
import VerdictCard from "./VerdictCard";

type State =
  | { phase: "idle" }
  | { phase: "reading"; preview: string }
  | { phase: "done"; preview: string; result: AnalyzeResult }
  | { phase: "error"; preview: string | null; message: string };

export default function Scanner() {
  const [state, setState] = useState<State>({ phase: "idle" });
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
        });
        return;
      }
      setState({ phase: "done", preview, result: payload as AnalyzeResult });
    } catch {
      setState({
        phase: "error",
        preview,
        message: "네트워크 오류입니다. 연결을 확인하고 다시 시도해 주세요.",
      });
    }
  }

  function reset() {
    if (state.phase !== "idle" && state.preview) {
      URL.revokeObjectURL(state.preview);
    }
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
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
        // 촬영 전 화면. 사진이 들어올 자리를 cloud로 비워두고, 그 위에 검은 알약
        // 하나만 얹는다 — 이 시스템에서 "이미지 위 CTA"가 놓이는 자리 그대로다.
        <div className="bg-cloud flex flex-col items-center gap-5 px-6 py-16">
          <CameraIcon />
          <p className="text-mute max-w-xs text-center text-sm leading-relaxed">
            그림문자와 성분표가 함께 보이도록 찍으면 가장 정확합니다
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-pill bg-ink text-canvas px-8 py-4 text-base font-medium transition-transform active:scale-95"
          >
            제품 라벨 촬영하기
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 사진은 이 시스템의 제품 사진과 같은 자리에 놓인다 — cloud 위에 여백 없이,
              테두리 없이. 화면에서 유일하게 색을 가진 면이다. 바로 아래 "다시 촬영"을
              붙여 결과가 길어져도 스크롤 없이 다시 찍을 수 있게 한다. */}
          {state.preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={state.preview}
              alt="촬영한 라벨"
              className="bg-cloud max-h-72 w-full object-contain"
            />
          )}

          {state.phase !== "reading" && (
            <button
              type="button"
              onClick={reset}
              className="rounded-pill bg-ink text-canvas w-full py-3.5 text-base font-medium transition-transform active:scale-95"
            >
              다시 촬영하기
            </button>
          )}

          {state.phase === "reading" && <ReadingIndicator />}

          {state.phase === "error" && (
            <div className="border-hazard-danger border p-5">
              <h2 className="text-hazard-danger font-medium">
                판독하지 못했습니다
              </h2>
              <p className="text-charcoal mt-1 text-sm">{state.message}</p>
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
    <div role="status" className="bg-cloud flex items-center gap-3 p-5">
      <span className="border-hairline border-t-ink size-5 animate-spin rounded-full border-2" />
      <span className="text-charcoal text-sm font-medium">
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
      className="text-mute size-12"
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
