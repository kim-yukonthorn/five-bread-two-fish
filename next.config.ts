import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // ลองบนมือถือใน Wi-Fi เดียวกับ npm run dev: ใส่ IP ของเครื่อง เช่น DEV_ORIGINS=192.168.1.45 มีผลเฉพาะตอน dev
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  // งานนำเสนอวิธีเล่นสำหรับขึ้นจอ เป็นไฟล์ static ใน public/how-to-play (รูปในหน้าใช้ path เต็ม จึงเปิดได้ทั้งมีและไม่มี / ท้าย)
  rewrites: async () => [{ source: "/how-to-play", destination: "/how-to-play/index.html" }],
};

export default nextConfig;
