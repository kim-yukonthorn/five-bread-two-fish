export function serverError(label: string, err: unknown): Response {
  console.error(label, err);
  return Response.json({ error: "server_error" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<Partial<T> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Partial<T>) : null;
}
