import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 모드 좌하단 "N" 배지가 폰 화면의 하단 탭을 가려서 끈다. 오류 오버레이는 그대로 뜬다.
  devIndicators: false,
};

export default nextConfig;
