import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允許本地預覽的跨來源請求
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // 讓 Next.js 正確推斷此專案為根目錄
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // 允許本機與瀏覽器預覽 proxy 來源送出 Server Actions（解決 origin/host 不一致）。
    // 注意：瀏覽器預覽的 127.0.0.1:<埠> 會隨工作階段變動，若登入再次出現
    // "Invalid Server Actions request"，請直接於瀏覽器開啟 http://localhost:3000/login。
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        '127.0.0.1:60204',
        'localhost:60204',
      ],
    },
  },
};

export default nextConfig;
