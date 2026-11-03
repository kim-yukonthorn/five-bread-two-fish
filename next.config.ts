import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // ลองบนมือถือใน Wi-Fi เดียวกับ npm run dev: ใส่ IP ของเครื่อง เช่น DEV_ORIGINS=192.168.1.45 มีผลเฉพาะตอน dev
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
};

export default nextConfig;
