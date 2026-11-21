import type { NextConfig } from "next";

// AI 서버(ai-server/ai-server)는 쿠키(SameSite=Strict)로 게임을 구분하므로 화면과 API가 같은 주소에서 나가야 한다.
// 그래서 /api/* 요청을 AI 서버로 넘긴다. 주소를 바꾸려면 AI_SERVER_URL 환경변수를 쓴다.
const aiServer = process.env.AI_SERVER_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${aiServer}/api/:path*` }];
  },
};

export default nextConfig;
