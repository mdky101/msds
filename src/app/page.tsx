import Scanner from "@/components/Scanner";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 pt-10 pb-16">
      {/*
        원본은 여기에 짙은 남색 "night" 히어로 밴드를 두지만 쓰지 않았다. 그건
        마케팅 페이지가 시선을 붙드는 장치이고, 이 화면에는 붙들 시선이 없다 —
        곧바로 찍어야 한다. 게다가 어두운 색면은 아래 위험도 신호와 경쟁한다.
      */}
      <header className="mb-8">
        <h1 className="display-1 text-ink">이거 위험한가요?</h1>
        <p className="text-ink-secondary mt-3 text-base leading-relaxed">
          화학제품 라벨을 찍으면 GHS 그림문자를 읽어 위험성을 알려드립니다.
        </p>
      </header>

      <Scanner />
    </main>
  );
}
