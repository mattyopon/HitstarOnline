import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hitstar Online — みんなで曲の年代当て",
  description:
    "Googleでログインして、離れた友達とオンラインで遊べる音楽の年代当てパーティーゲーム。曲を聴いて発売年を当て、タイムラインに並べよう。",
};

export const viewport: Viewport = {
  themeColor: "#0c0a1a",
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
      <body>{children}</body>
    </html>
  );
}
