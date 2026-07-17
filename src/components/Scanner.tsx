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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 transition-colors hover:border-blue-400 hover:bg-blue-50/50 active:bg-blue-50"
        >
          <CameraIcon />
          <span className="text-lg font-semibold text-slate-900">
            제품 라벨 촬영하기
          </span>
          <span className="max-w-xs text-center text-sm text-slate-500">
            그림문자와 성분표가 함께 보이도록 찍으면 가장 정확합니다
          </span>
        </button>
      ) : (
        <div className="space-y-5">
          {/* 사진과 다시 찍기를 붙여 둔다. 결과가 길어져도 스크롤을 내리지 않고
              바로 다시 찍을 수 있어야 한다. */}
          {state.preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={state.preview}
              alt="촬영한 라벨"
              className="max-h-72 w-full rounded-2xl border border-slate-200 object-contain"
            />
          )}

          {state.phase !== "reading" && (
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-2xl bg-slate-900 py-3.5 text-base font-semibold text-white transition-colors hover:bg-slate-700 active:bg-slate-800"
            >
              다시 촬영하기
            </button>
          )}

          {state.phase === "reading" && <ReadingIndicator />}

          {state.phase === "error" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-semibold text-red-900">판독하지 못했습니다</h2>
              <p className="mt-1 text-sm text-red-800">{state.message}</p>
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
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      <span className="text-sm font-medium text-slate-700">
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
      className="size-12 text-slate-400"
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
