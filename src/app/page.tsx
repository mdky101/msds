import Scanner from "@/components/Scanner";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 pt-8 pb-16">
      {/* 편집 로크업. 이 화면의 유일한 큰 글씨이고, 나머지는 전부 12~16px로 물러선다. */}
      <header className="mb-6">
        <h1 className="display-lockup text-ink text-[56px]">
          이거
          <br />
          위험한가요?
        </h1>
        <p className="text-mute mt-4 text-sm leading-relaxed">
          화학제품 라벨을 찍으면 GHS 그림문자를 읽어 위험성을 알려드립니다.
        </p>
      </header>

      <hr className="border-hairline mb-6" />

      <Scanner />
    </main>
  );
}
