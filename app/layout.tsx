import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// 갈무리(Galmuri) 한글 픽셀 글꼴, SIL Open Font License 1.1 (app/fonts/OFL-Galmuri.md)
const px = localFont({
  src: [
    { path: "./fonts/Galmuri11.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Galmuri11-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-px",
  display: "swap",
});
const pxTitle = localFont({ src: "./fonts/Galmuri14.woff2", variable: "--font-px-title", display: "swap" });
const pxSmall = localFont({ src: "./fonts/Galmuri9.woff2", variable: "--font-px-small", display: "swap" });

export const metadata: Metadata = {
  title: "방과후 탐정단 · AI 추리게임",
  description: "학원 강의실에서 벌어진 일상 미스터리를 AI 용의자 심문으로 풀어내는 픽셀 추리게임",
};

export const viewport: Viewport = { themeColor: "#1b1220" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${px.variable} ${pxTitle.variable} ${pxSmall.variable}`}>
      <body>{children}</body>
    </html>
  );
}
