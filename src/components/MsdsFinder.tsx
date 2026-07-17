"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  KOSHA_DETAIL_URL,
  KOSHA_DETAIL_VIEW_TYPE,
  type ChemHit,
  type SearchOutcome,
} from "@/lib/koshaShared";
import type { WebHit, WebSearchOutcome } from "@/lib/naver";
import type { SourceTier } from "@/lib/sourceRank";
import type { GhsCode } from "@/lib/ghs";
import PdfComposition from "./PdfComposition";
import MsdsSummaryPanel from "./MsdsSummaryPanel";

type Panel<T> =
  | { phase: "loading" }
  | { phase: "done"; data: T }
  | { phase: "error"; message: string };

export default function MsdsFinder({
  initialQuery,
  casNumbers,
  manufacturer,
  photoPictograms,
}: {
  initialQuery: string;
  casNumbers: string[];
  manufacturer: string | null;
  photoPictograms: GhsCode[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [kosha, setKosha] = useState<Panel<SearchOutcome>>({ phase: "loading" });
  const [web, setWeb] = useState<Panel<WebSearchOutcome>>({ phase: "loading" });
  const firstRun = useRef(true);

  const run = useCallback(
    (q: string, withCas: string[]) => {
      setKosha({ phase: "loading" });
      setWeb({ phase: "loading" });

      // 두 곳을 동시에 친다. 한쪽이 느리다고 다른 쪽을 기다릴 이유가 없다.
      void post<SearchOutcome>("/api/search-msds", {
        query: q,
        casNumbers: withCas,
      }).then(setKosha);

      void post<WebSearchOutcome>("/api/search-web", {
        query: q,
        manufacturer,
      }).then(setWeb);
    },
    [manufacturer],
  );

  useEffect(() => {
    if (!firstRun.current) return;
    firstRun.current = false;
    run(initialQuery, casNumbers);
  }, [initialQuery, casNumbers, run]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // 사용자가 제품명을 고쳤다는 건 판독이 틀렸다는 뜻이다.
    // 그 판독에서 나온 CAS도 믿을 수 없으므로 버린다.
    if (query.trim()) run(query.trim(), []);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="font-semibold text-slate-900">국문 MSDS 찾기</h3>
        <p className="mt-1 text-xs text-slate-500">
          제품명이 잘못 읽혔으면 고쳐서 다시 검색하세요.
        </p>
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제품명, 물질명 또는 CAS 번호"
            aria-label="검색어"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!query.trim()}
            className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            검색
          </button>
        </form>
      </div>

      {/* 실제 제품을 찍어보면 공단 자료는 대부분 걸리지 않는다(물질 DB이므로).
          현장에서 먼저 보이는 건 제조사 자료여야 한다. */}
      <Group
        title="제조사 공식 자료 (웹 검색)"
        hint="제조사 사이트의 SDS 페이지로 안내합니다. 상표명 제품은 여기서 찾힙니다."
      >
        {web.phase === "loading" && <Loading label="웹에서 찾는 중…" />}
        {web.phase === "error" && <ErrorLine message={web.message} />}
        {web.phase === "done" && (
          <WebResults
            outcome={web.data}
            labelCasNumbers={casNumbers}
            labelProductName={initialQuery || null}
          />
        )}
      </Group>

      <Group
        title="안전보건공단 정식 자료"
        hint="법정 국문 MSDS입니다. 물질 단위라 상표명 제품은 잘 나오지 않고, 성분의 물질명이나 CAS 번호로 찾을 때 걸립니다."
      >
        {kosha.phase === "loading" && <Loading label="공단에서 찾는 중…" />}
        {kosha.phase === "error" && <ErrorLine message={kosha.message} />}
        {kosha.phase === "done" && (
          <KoshaResults outcome={kosha.data} photoPictograms={photoPictograms} />
        )}
      </Group>
    </section>
  );
}

async function post<T>(url: string, body: unknown): Promise<Panel<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) {
      return { phase: "error", message: payload?.message ?? "조회에 실패했습니다." };
    }
    return { phase: "done", data: payload as T };
  } catch {
    return { phase: "error", message: "네트워크 오류입니다." };
  }
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="text-sm text-slate-500">
      {label}
    </p>
  );
}

function ErrorLine({ message }: { message: string }) {
  return <p className="text-sm text-red-700">{message}</p>;
}

function KoshaResults({
  outcome,
  photoPictograms,
}: {
  outcome: SearchOutcome;
  photoPictograms: GhsCode[];
}) {
  if (outcome.hits.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        공단에서 찾지 못했습니다. 상표명 제품은 대개 여기 없으니 위의 제조사 자료를
        보세요. 법정 자료가 필요하면 용기 성분표의{" "}
        <strong>물질명이나 CAS 번호</strong>로 다시 검색하면 걸립니다.
      </p>
    );
  }

  return (
    <>
      <p className="text-xs text-slate-500">
        <strong className="text-slate-700">
          &ldquo;{outcome.usedQuery}&rdquo;
        </strong>
        (으)로 찾은 {outcome.hits.length}건 · CAS가 일치하는 항목을 고르세요
      </p>
      <ul className="mt-2 space-y-2">
        {outcome.hits.map((hit) => (
          <li key={hit.chemId}>
            <KoshaRow hit={hit} />
            <MsdsSummaryPanel
              chemId={hit.chemId}
              photoPictograms={photoPictograms}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/** KOSHA 상세는 GET 링크가 아니라 POST 폼으로만 열린다. */
function KoshaRow({ hit }: { hit: ChemHit }) {
  return (
    <form action={KOSHA_DETAIL_URL} method="POST" target="_blank" rel="noopener">
      <input type="hidden" name="viewType" value={KOSHA_DETAIL_VIEW_TYPE} />
      <input type="hidden" name="chem_id" value={hit.chemId} />
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words text-slate-900">
            {hit.nameKor}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {hit.casNo ? `CAS ${hit.casNo}` : "CAS 없음"}
            {hit.lastDate && ` · 갱신 ${hit.lastDate}`}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-blue-700">
          원본 보기 ↗
        </span>
      </button>
    </form>
  );
}

const TIER_STYLE: Record<SourceTier, string> = {
  government: "bg-emerald-100 text-emerald-800",
  official: "bg-blue-100 text-blue-800",
  vendor: "bg-slate-100 text-slate-600",
  aggregator: "bg-amber-100 text-amber-800",
};

function WebResults({
  outcome,
  labelCasNumbers,
  labelProductName,
}: {
  outcome: WebSearchOutcome;
  labelCasNumbers: string[];
  labelProductName: string | null;
}) {
  if (outcome.hits.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        웹에서도 찾지 못했습니다. 제품명을 라벨에 인쇄된 그대로(영문 포함) 입력해
        보세요.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {outcome.hits.map((hit) => (
          <li key={hit.url}>
            <WebRow hit={hit} />
            {/* PDF에만 붙인다. 제조사 제품 페이지는 읽어봐야 성분표가 없다. */}
            {hit.isPdf && (
              <PdfComposition
                url={hit.url}
                labelCasNumbers={labelCasNumbers}
                labelProductName={labelProductName}
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <strong>제품 변형에 주의하세요.</strong> 같은 브랜드라도 종류마다(예:
        일반형·탈지제·건성윤활) MSDS가 다릅니다. 손에 든 용기에 적힌 정확한
        제품명과 검색 결과가 같은지 확인하세요.
      </p>
    </>
  );
}

function WebRow({ hit }: { hit: WebHit }) {
  return (
    <a
      href={hit.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-slate-200 p-3 transition-colors hover:border-blue-400 hover:bg-blue-50"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_STYLE[hit.grade.tier]}`}
        >
          {hit.grade.label}
        </span>
        {hit.isPdf && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            PDF
          </span>
        )}
      </span>
      <span className="mt-1.5 block font-medium break-words text-slate-900">
        {hit.title}
      </span>
      <span className="mt-0.5 block text-xs break-all text-slate-500">
        {hit.grade.note}
      </span>
    </a>
  );
}
