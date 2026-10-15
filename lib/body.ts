export class BodyTooLarge extends Error {
  constructor() {
    super("The request body is too large.");
  }
}

export async function readText(req: Request, maxBytes: number): Promise<string> {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new BodyTooLarge();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
