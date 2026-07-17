import { GHS_CATALOG, RISK_STYLE } from "@/lib/ghs";
import type { AnalyzeResult } from "@/lib/types";
import MsdsFinder from "./MsdsFinder";

export default function VerdictCard({ result }: { result: AnalyzeResult }) {
  const { reading, verdict, nextStep } = result;
  const style = RISK_STYLE[verdict.level];
  // 제품명이 안 읽혔어도 성분명이 있으면 그걸로 찾을 수 있다.
  const searchSeed =
    reading.productName ?? reading.ingredients[0] ?? reading.casNumbers[0] ?? "";

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border-2 p-5 ${style.panel}`}>
        <span
          className={`inline-block rounded-full px-4 py-1 text-lg font-bold ${style.badge}`}
        >
          {style.label}
        </span>
        <h2 className="mt-3 text-xl font-bold text-slate-900">
          {verdict.headline}
        </h2>
        <ul className="mt-3 space-y-1.5">
          {verdict.reasons.map((reason) => (
            <li key={reason} className="flex gap-2 text-sm text-slate-700">
              <span aria-hidden className="text-slate-400">
                •
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {reading.pictograms.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-500">
            라벨에서 찾은 그림문자
          </h3>
          <ul className="mt-3 space-y-2.5">
            {reading.pictograms.map((code) => {
              const info = GHS_CATALOG[code];
              return (
                <li key={code} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded border border-slate-300 px-1.5 py-0.5 font-mono text-xs text-slate-500">
                    {code}
                  </span>
                  <span className="text-sm">
                    <strong className="text-slate-900">{info.name}</strong>
                    <span className="text-slate-500"> — {info.symbol}</span>
                    <br />
                    <span className="text-slate-600">{info.meaning}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <LabelFacts reading={reading} />

      {reading.isChemicalProduct && (
        <MsdsFinder
          initialQuery={searchSeed}
          casNumbers={reading.casNumbers}
          manufacturer={reading.manufacturer}
          photoPictograms={reading.pictograms}
        />
      )}

      <NextStepPanel step={nextStep} />

      <p className="rounded-xl bg-slate-100 p-4 text-xs leading-relaxed text-slate-600">
        <strong className="text-slate-800">이 판정은 참고용입니다.</strong> 사진
        판독은 라벨이 가려지거나 흐릴 때 틀릴 수 있고, 그림문자가 보이지 않는다고
        해서 안전한 물질이라는 뜻이 아닙니다. 법적 효력이 있는 자료는 해당 제품의
        원본 MSDS이며, 취급 전 반드시 원본을 확인하세요.
      </p>
    </div>
  );
}

function LabelFacts({ reading }: { reading: AnalyzeResult["reading"] }) {
  const rows: Array<[string, string]> = [];
  if (reading.productName) rows.push(["제품명", reading.productName]);
  if (reading.manufacturer) rows.push(["제조사", reading.manufacturer]);
  if (reading.casNumbers.length)
    rows.push(["CAS 번호", reading.casNumbers.join(", ")]);
  if (reading.ingredients.length)
    rows.push(["성분", reading.ingredients.join(", ")]);
  if (reading.signalWord) rows.push(["신호어", reading.signalWord]);

  if (rows.length === 0 && reading.hazardStatements.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-500">
        라벨에서 읽은 내용
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        아래 내용이 사진과 다르면 다시 촬영해 주세요.
      </p>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-2 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium break-words text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {reading.hazardStatements.length > 0 && (
        <>
          <h4 className="mt-4 text-sm text-slate-500">유해·위험 문구</h4>
          <ul className="mt-1.5 space-y-1">
            {reading.hazardStatements.map((s) => (
              <li key={s} className="text-sm text-slate-700">
                {s}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function NextStepPanel({ step }: { step: AnalyzeResult["nextStep"] }) {
  // CAS를 읽은 경우는 위 검색 패널이 이미 그 번호로 조회를 끝냈다. 덧붙일 말이 없다.
  if (step.kind === "lookup_cas") return null;

  if (step.kind === "need_ingredient_side") {
    return (
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h3 className="font-semibold text-blue-900">성분표를 찍으면 더 정확합니다</h3>
        <p className="mt-1 text-sm text-blue-800">
          {step.productName ? `"${step.productName}"에서 ` : ""}CAS 번호를 찾지
          못했습니다. 용기 뒷면이나 옆면의 성분표를 찍으면 물질을 정확히 특정할 수
          있습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="font-semibold text-slate-800">다시 촬영해 주세요</h3>
      <p className="mt-1 text-sm text-slate-600">{step.why}</p>
      <p className="mt-2 text-xs text-slate-500">
        라벨이 화면을 가득 채우도록, 빛 반사를 피해 정면에서 찍으면 잘 읽힙니다.
      </p>
    </section>
  );
}
