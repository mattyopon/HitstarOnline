import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hitstar Online — みんなで曲の年代当て",
  description:
    "Googleでログインして、離れた友達とオンラインで遊べる音楽の年代当てパーティーゲーム。曲を聴いて発売年を当て、タイムラインに並べよう。",
};

export const viewport: Viewport = {
  themeColor: "#fff8fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=ZCOOL+KuaiLe&family=Noto+Sans+SC:wght@400;500;700;900&family=Bebas+Neue&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
