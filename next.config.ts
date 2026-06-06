import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允許本地預覽的跨來源請求
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // 讓 Next.js 正確推斷此專案為根目錄
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // 允許瀏覽器預覽 proxy 來源送出 Server Actions（解決 origin/host 不一致）
    serverActions: {
      allowedOrigins: ['localhost:3003', '127.0.0.1:3003', '127.0.0.1:52837'],
    },
  },
};

export default nextConfig;
