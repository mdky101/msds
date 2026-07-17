import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "이거 위험한가요? — 화학제품 라벨 판독",
  description:
    "화학제품 라벨을 촬영하면 GHS 그림문자를 읽어 위험성을 알려주고, 국문 MSDS를 찾아줍니다.",
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="bg-canvas text-ink flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
