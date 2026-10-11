import { Suspense } from "react";
import AdminClient from "./admin-client";

// หน้า admin เข้าผ่าน URL ลับ ไม่มีลิงก์จากหน้าอื่น (docs/product-design.md ข้อ 4.3)
// ตัวหน้าไม่ตรวจ token เอง ทุก API ตรวจจาก header แล้วหน้าแสดง "ไม่พบหน้านี้" ถ้าไม่ผ่าน
export default function Page({ params }: PageProps<"/a/[token]">) {
  return <Suspense fallback={null}>{params.then(({ token }) => <AdminClient token={token} />)}</Suspense>;
}
