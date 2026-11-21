import type { NextConfig } from "next";

// 기존 Node.js AI 서버 주소
const aiServer =
  process.env.AI_SERVER_URL ?? "http://127.0.0.1:3001";

// 기존 npm run dev(Next.js) 실행 여부
const isNextDev =
  process.env.npm_lifecycle_event === "dev";

// 명시적인 설정을 우선하고,
// 기본 npm run dev에서는 기존 Node.js 서버를 사용한다.
const useNodeServer =
  process.env.GOTBONG_BACKEND === "node" ||
  (
    process.env.GOTBONG_BACKEND !== "workers" &&
    isNextDev
  );

const nextConfig: NextConfig = {
  devIndicators: false,

  // 기존 Next.js 개발 환경에서만 API 프록시 사용
  ...(useNodeServer
    ? {
        async rewrites() {
          return {
            beforeFiles: [
              {
                source: "/api/:path*",
                destination: `${aiServer}/api/:path*`,
              },
            ],
            afterFiles: [],
            fallback: [],
          };
        },
      }
    : {}),
};

export default nextConfig;