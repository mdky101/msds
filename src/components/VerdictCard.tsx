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
    <div className="space-y-6">
      {/* 판정. 이 화면에서 색이 허용된 유일한 자리다. */}
      <section className={`border-2 p-5 ${style.panel}`}>
        <span
          className={`rounded-pill inline-block px-4 py-1 text-sm font-medium ${style.badge}`}
        >
          {style.label}
        </span>
        <h2 className="display-lockup text-ink mt-3 text-2xl">
          {verdict.headline}
        </h2>
        <ul className="mt-4 space-y-1.5">
          {verdict.reasons.map((reason) => (
            <li key={reason} className="text-charcoal flex gap-2 text-sm">
              <span aria-hidden className="text-mute">
                ·
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {reading.pictograms.length > 0 && (
        <section>
          <h3 className="text-mute text-xs font-medium">
            라벨에서 찾은 그림문자
          </h3>
          <ul className="mt-3">
            {reading.pictograms.map((code) => {
              const info = GHS_CATALOG[code];
              return (
                <li
                  key={code}
                  className="border-hairline flex items-start gap-3 border-b py-3 last:border-b-0"
                >
                  <span className="text-mute mt-0.5 shrink-0 font-mono text-xs">
                    {code}
                  </span>
                  <span className="text-sm">
                    <strong className="text-ink font-medium">{info.name}</strong>
                    <span className="text-mute"> — {info.symbol}</span>
                    <br />
                    <span className="text-charcoal">{info.meaning}</span>
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

      <p className="bg-cloud text-mute p-4 text-xs leading-relaxed">
        <strong className="text-ink font-medium">이 판정은 참고용입니다.</strong>{" "}
        사진 판독은 라벨이 가려지거나 흐릴 때 틀릴 수 있고, 그림문자가 보이지
        않는다고 해서 안전한 물질이라는 뜻이 아닙니다. 법적 효력이 있는 자료는 해당
        제품의 원본 MSDS이며, 취급 전 반드시 원본을 확인하세요.
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
    <section>
      <h3 className="text-mute text-xs font-medium">라벨에서 읽은 내용</h3>
      <p className="text-mute mt-1 text-xs">
        아래 내용이 사진과 다르면 다시 촬영해 주세요.
      </p>
      <dl className="mt-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="border-hairline grid grid-cols-[5.5rem_1fr] gap-2 border-b py-2.5 text-sm"
          >
            <dt className="text-mute">{label}</dt>
            <dd className="text-ink font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {reading.hazardStatements.length > 0 && (
        <>
          <h4 className="text-mute mt-5 text-xs font-medium">유해·위험 문구</h4>
          <ul className="mt-2 space-y-1">
            {reading.hazardStatements.map((s) => (
              <li key={s} className="text-charcoal text-sm">
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
      <section className="bg-cloud p-5">
        <h3 className="text-ink font-medium">성분표를 찍으면 더 정확합니다</h3>
        <p className="text-charcoal mt-1 text-sm leading-relaxed">
          {step.productName ? `"${step.productName}"에서 ` : ""}CAS 번호를 찾지
          못했습니다. 용기 뒷면이나 옆면의 성분표를 찍으면 물질을 정확히 특정할 수
          있습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-cloud p-5">
      <h3 className="text-ink font-medium">다시 촬영해 주세요</h3>
      <p className="text-charcoal mt-1 text-sm">{step.why}</p>
      <p className="text-mute mt-2 text-xs">
        라벨이 화면을 가득 채우도록, 빛 반사를 피해 정면에서 찍으면 잘 읽힙니다.
      </p>
    </section>
  );
}
