import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SheetCopilot - AI 試算表自動化助理",
  description: "用 AI 分析資料、產生公式與 Apps Script、自動輸出報表",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
