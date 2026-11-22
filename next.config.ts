import type { NextConfig } from "next";

// 화면과 /api/*는 vinext로 하나의 Cloudflare Worker에서 실행한다 (별도 API 서버 없음).
const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
