import Scanner from "@/components/Scanner";

export default function Home() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pt-6 pb-16">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          이거 위험한가요?
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          화학제품 라벨을 찍으면 GHS 그림문자를 읽어 위험성을 알려드립니다.
        </p>
      </header>

      <Scanner />
    </main>
  );
}
