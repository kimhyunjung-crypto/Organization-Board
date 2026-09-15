import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from "react";
import ProductApp from "./product/ProductApp";
import { inspectLocalAssets, type AssetReadiness } from "./technical/assets";
import { syntheticFixture, validateSyntheticFixture } from "./technical/fixture";

type AssetProbe = () => Promise<AssetReadiness>;

export interface AppProps {
  readonly assetProbe?: AssetProbe;
}

type ProbeState =
  | { readonly kind: "checking" }
  | { readonly kind: "complete"; readonly result: AssetReadiness };

const spikeModules = import.meta.glob<Record<string, ComponentType>>("./technical/**/*Harness.tsx");
const spikeDefinitions = [
  { id: "spreadsheet", name: "S00.02 · XLSX 시험", component: "SpreadsheetHarness" },
  { id: "imaging", name: "S00.03 · 사진·크롭 시험", component: "ImagingHarness" },
  { id: "pdf", name: "S00.04 · PDF·인쇄 시험", component: "PdfHarness" },
] as const;
const spikeComponents = new Map(spikeDefinitions.map((definition) => {
  const loader = Object.entries(spikeModules).find(([path]) =>
    path.endsWith(`/${definition.component}.tsx`),
  )?.[1];
  return [definition.id, loader ? lazy(async () => {
    const module = await loader();
    const component = module[definition.component] ?? module.default;
    if (!component) throw new Error("시험 화면 내보내기를 확인해 주세요.");
    return { default: component };
  }) : undefined];
}));
function PendingSpike() {
  return <main className="harness-shell"><h1>기술 시험</h1><p>시험 모듈 구현 중입니다.</p></main>;
}
const SpreadsheetSpike = spikeComponents.get("spreadsheet") ?? PendingSpike;
const ImagingSpike = spikeComponents.get("imaging") ?? PendingSpike;
const PdfSpike = spikeComponents.get("pdf") ?? PendingSpike;

export function App(props: AppProps) {
  const requested = new URLSearchParams(window.location.search).get("spike");

  if (!requested) {
    return <ProductApp />;
  }

  const isFoundation = requested === "foundation";
  const definition = spikeDefinitions.find((spike) => spike.id === requested);

  return (
    <>
      <nav className="spike-navigation" aria-label="기술 시험 이동">
        <a href="/">← 조직보드 제품으로 이동</a>
        <a href="/?spike=foundation">S00.01 · 환경</a>
        {spikeDefinitions.map((spike) => (
          <a href={`/?spike=${spike.id}`} key={spike.id}>
            {spike.name}
          </a>
        ))}
      </nav>
      {definition ? (
        <Suspense fallback={<p className="harness-shell" role="status">시험 화면을 불러오는 중입니다.</p>}>
          {definition.id === "spreadsheet" ? (
            <SpreadsheetSpike />
          ) : definition.id === "imaging" ? (
            <ImagingSpike />
          ) : (
            <PdfSpike />
          )}
        </Suspense>
      ) : isFoundation ? (
        <FoundationHarness {...props} />
      ) : (
        <ProductApp />
      )}
    </>
  );
}

function FoundationHarness({ assetProbe = inspectLocalAssets }: AppProps) {
  const [assetState, setAssetState] = useState<ProbeState>({ kind: "checking" });
  const fixtureProblems = useMemo(() => validateSyntheticFixture(syntheticFixture), []);

  useEffect(() => {
    let active = true;

    void assetProbe().then((result) => {
      if (active) {
        setAssetState({ kind: "complete", result });
      }
    });

    return () => {
      active = false;
    };
  }, [assetProbe]);

  const assetsReady = assetState.kind === "complete" && assetState.result.ready;
  const fixtureReady = fixtureProblems.length === 0;

  return (
    <main className="harness-shell">
      <header className="hero">
        <p className="eyebrow">S00.01 · 재현 가능한 기술 시험 환경</p>
        <h1>조직보드 기술 시험 Harness</h1>
        <p>
          이 화면은 제품 기능이 아닌 기술 시험용 최소 환경입니다. 모든 예시는 실제 직원 정보가 아닌
          명시적인 합성 fixture만 사용합니다.
        </p>
      </header>

      <section className="summary" aria-labelledby="summary-title">
        <div>
          <p className="section-label">환경 요약</p>
          <h2 id="summary-title">S00.01 준비 상태</h2>
        </div>
        <span className={`summary-badge ${assetsReady && fixtureReady ? "ready" : "pending"}`}>
          {assetsReady && fixtureReady ? "기술 시험 준비 완료" : "준비 상태 확인 필요"}
        </span>
      </section>

      <div className="readiness-grid">
        <section className="check-card" aria-labelledby="toolchain-title">
          <span className="status-dot ready" aria-hidden="true" />
          <div>
            <h2 id="toolchain-title">도구 체인</h2>
            <p>React · TypeScript strict · Vite · Vitest · Playwright</p>
            <p className="detail">typecheck, lint, test, build, test:e2e 명령을 제공합니다.</p>
          </div>
        </section>

        <section className="check-card" aria-labelledby="fixture-title">
          <span className={`status-dot ${fixtureReady ? "ready" : "error"}`} aria-hidden="true" />
          <div>
            <h2 id="fixture-title">합성 fixture</h2>
            <p>{fixtureReady ? `${syntheticFixture.rows.length}개 합성 행 검증 완료` : "fixture 검사 실패"}</p>
            {fixtureProblems.map((problem) => (
              <p className="detail error-text" key={problem}>
                {problem}
              </p>
            ))}
          </div>
        </section>

        <section className="check-card asset-card" aria-labelledby="asset-title">
          <span
            className={`status-dot ${assetState.kind === "checking" ? "checking" : assetsReady ? "ready" : "error"}`}
            aria-hidden="true"
          />
          <div>
            <h2 id="asset-title">로컬 자산</h2>
            <p data-testid="asset-summary" aria-live="polite">
              {assetState.kind === "checking"
                ? "manifest와 SHA-256을 확인하는 중입니다."
                : assetsReady
                  ? "폰트·모델·WASM 준비 완료"
                  : "로컬 자산 확인이 필요합니다."}
            </p>
            {assetState.kind === "complete" && (
              <ul className="asset-list">
                {assetState.result.checks.map((check) => (
                  <li key={check.path}>
                    <code>{check.path}</code>
                    <span className={check.state === "error" ? "error-text" : undefined}>{check.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <aside className="boundary-note">
        <strong>시험 범위</strong>
        <span>직원 입력, 사진 매칭, 얼굴 검출, PDF 생성은 후속 Story에서 검증합니다.</span>
      </aside>
    </main>
  );
}
