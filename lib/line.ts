// ตรวจ LIFF ID token กับ LINE ห้ามเชื่อ userId ที่ client ส่งมาตรงๆ (docs/tech-design.md ข้อ 5)

export type LineProfile = { userId: string; name: string; picture: string | null };

/** token ไม่ผ่าน (หมดอายุ, ผิด channel, ปลอม) ต่างจาก error ของระบบเรา */
export class LineVerifyError extends Error {}

export async function verifyLineIdToken(idToken: string): Promise<LineProfile> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) throw new Error("LINE_CHANNEL_ID is not set");

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    signal: AbortSignal.timeout(8_000),
  });
  const data: { sub?: string; name?: string; picture?: string; error_description?: string } | null =
    await res.json().catch(() => null);

  if (!res.ok || !data?.sub) {
    throw new LineVerifyError(data?.error_description ?? `LINE verify failed (${res.status})`);
  }
  return { userId: data.sub, name: data.name?.trim() || "ผู้เล่น", picture: data.picture ?? null };
}
