import AdminClient from "./admin-client";

// หน้า admin ไม่มีลิงก์จากหน้าอื่น (docs/product-design.md ข้อ 4.3)
// ตัวหน้าเป็น static ทุก API ตรวจ PIN เอง (ถ้าตั้ง ADMIN_PIN ไว้)
export default function Page() {
  return <AdminClient />;
}
