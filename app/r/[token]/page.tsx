import { Suspense } from "react";
import ResultsClient from "./results-client";

// หน้าประกาศผล เข้าผ่าน URL ลับ ใช้ขึ้นจอ (docs/product-design.md ข้อ 4.4)
export default function Page({ params }: PageProps<"/r/[token]">) {
  return <Suspense fallback={null}>{params.then(({ token }) => <ResultsClient token={token} />)}</Suspense>;
}
