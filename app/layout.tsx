import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "5 Bread 2 Fish",
  description: "มินิเกมค่าย ขนมปังกับปลา",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// ไม่ใช้ web font และรูปภาพ เพื่อให้เบาบนสัญญาณอ่อน (docs/tech-design.md ข้อ 7)
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
