import { GHS_CATALOG, RISK_STYLE } from "@/lib/ghs";
import { diffPictograms, type OfficialGhs } from "@/lib/msdsSummary";
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
      {/* 판정. 색 테두리를 두르지 않고 배경 틴트와 작은 알약 하나로만 말한다. */}
      <section className={`border-hairline rounded-lg border p-6 ${style.panel}`}>
        <span
          className={`eyebrow inline-block rounded-full px-2.5 py-1 ${style.badge}`}
        >
          {style.label}
        </span>
        <h2 className="heading-2 text-ink mt-3">{verdict.headline}</h2>
        <ul className="mt-4 space-y-1.5">
          {verdict.reasons.map((reason) => (
            <li
              key={reason}
              className="text-ink-secondary flex gap-2 text-[15px] leading-relaxed"
            >
              <span aria-hidden className="text-ink-faint">
                ·
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {result.officialGhs && (
        <OfficialGhsCard
          official={result.officialGhs}
          photoPictograms={reading.pictograms}
        />
      )}

      {reading.pictograms.length > 0 && (
        <section className="border-hairline bg-surface rounded-lg border p-6">
          <h3 className="eyebrow text-ink-muted">
            {result.officialGhs ? "사진에서 읽은 그림문자" : "라벨에서 찾은 그림문자"}
          </h3>
          <ul className="mt-3 space-y-3">
            {reading.pictograms.map((code) => {
              const info = GHS_CATALOG[code];
              return (
                <li key={code} className="flex items-start gap-3">
                  <span className="bg-canvas text-ink-muted rounded-xs mt-0.5 shrink-0 px-1.5 py-0.5 font-mono text-[11px]">
                    {code}
                  </span>
                  <span className="text-[15px]">
                    <strong className="text-ink font-semibold">
                      {info.name}
                    </strong>
                    <span className="text-ink-muted"> — {info.symbol}</span>
                    <br />
                    <span className="text-ink-secondary">{info.meaning}</span>
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

      <p className="text-ink-muted px-1 text-sm leading-relaxed">
        <strong className="text-ink-secondary font-semibold">
          이 판정은 참고용입니다.
        </strong>{" "}
        사진 판독은 라벨이 가려지거나 흐릴 때 틀릴 수 있고, 그림문자가 보이지
        않는다고 해서 안전한 물질이라는 뜻이 아닙니다. 법적 효력이 있는 자료는 해당
        제품의 원본 MSDS이며, 취급 전 반드시 원본을 확인하세요.
      </p>
    </div>
  );
}

/**
 * CAS로 특정한 물질의 공단 공식 그림문자. 사진에서 작은 아이콘을 인식하는 것보다
 * 정확하고, 사진이 놓친 그림문자를 잡아준다. 다만 공단은 순물질 기준이라 혼합물
 * 제품과 다를 수 있음을 밝힌다.
 */
function OfficialGhsCard({
  official,
  photoPictograms,
}: {
  official: OfficialGhs;
  photoPictograms: AnalyzeResult["reading"]["pictograms"];
}) {
  const diff = diffPictograms(photoPictograms, official.pictograms);

  return (
    <section className="border-hairline bg-surface rounded-lg border p-6">
      <h3 className="eyebrow text-ink-muted">
        공단 공식 그림문자 · CAS {official.casNo}
      </h3>
      {official.signalWord && (
        <p className="text-ink mt-2 text-[15px]">
          신호어 <strong className="font-semibold">«{official.signalWord}»</strong>
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {official.pictograms.map((code) => {
          const info = GHS_CATALOG[code];
          return (
            <li key={code} className="flex items-start gap-3">
              <span className="bg-canvas text-ink-muted rounded-xs mt-0.5 shrink-0 px-1.5 py-0.5 font-mono text-[11px]">
                {code}
              </span>
              <span className="text-[15px]">
                <strong className="text-ink font-semibold">{info.name}</strong>
                <span className="text-ink-secondary"> — {info.meaning}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {diff.missedOnPhoto.length > 0 && photoPictograms.length > 0 && (
        <p className="bg-hazard-warning-soft rounded-md text-ink-secondary mt-3 p-3 text-[13px] leading-relaxed">
          <strong className="text-hazard-warning font-semibold">
            사진에서 놓친 유해성이 있습니다.
          </strong>{" "}
          공단 자료에는 있으나 사진에서 확인되지 않은 것:{" "}
          {diff.missedOnPhoto.map((c) => GHS_CATALOG[c].name).join(", ")}.
        </p>
      )}

      <p className="text-ink-muted mt-3 text-[13px] leading-relaxed">
        이 물질(순물질) 기준의 공식 정보입니다. 제품이 혼합물이면 실제 라벨과 다를
        수 있습니다.
      </p>
    </section>
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
    <section className="border-hairline bg-surface rounded-lg border p-6">
      <h3 className="eyebrow text-ink-muted">라벨에서 읽은 내용</h3>
      <p className="text-ink-muted mt-1 text-sm">
        아래 내용이 사진과 다르면 다시 촬영해 주세요.
      </p>
      <dl className="mt-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="border-hairline grid grid-cols-[5.5rem_1fr] gap-2 border-b py-2.5 text-[15px] last:border-b-0"
          >
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-ink font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {reading.hazardStatements.length > 0 && (
        <>
          <h4 className="eyebrow text-ink-muted mt-5">유해·위험 문구</h4>
          <ul className="mt-2 space-y-1">
            {reading.hazardStatements.map((s) => (
              <li key={s} className="text-ink-secondary text-[15px]">
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
      <section className="border-hairline bg-surface rounded-lg border p-6">
        <h3 className="title-md text-ink">성분표를 찍으면 더 정확합니다</h3>
        <p className="text-ink-secondary mt-1 text-[15px] leading-relaxed">
          {step.productName ? `"${step.productName}"에서 ` : ""}CAS 번호를 찾지
          못했습니다. 용기 뒷면이나 옆면의 성분표를 찍으면 물질을 정확히 특정할 수
          있습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="border-hairline bg-surface rounded-lg border p-6">
      <h3 className="title-md text-ink">다시 촬영해 주세요</h3>
      <p className="text-ink-secondary mt-1 text-[15px]">{step.why}</p>
      <p className="text-ink-muted mt-2 text-sm">
        라벨이 화면을 가득 채우도록, 빛 반사를 피해 정면에서 찍으면 잘 읽힙니다.
      </p>
    </section>
  );
}
