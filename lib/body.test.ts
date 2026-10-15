import { expect, test } from "bun:test";
import { BodyTooLarge, readText } from "./body";

test("a declared length over the cap is refused without reading", async () => {
  const req = { headers: new Headers({ "content-length": "101" }), body: null } as unknown as Request;
  expect(readText(req, 100)).rejects.toBeInstanceOf(BodyTooLarge);
});

test("a streamed body is cut off once it passes the cap, and small ones read whole", async () => {
  const post = (body: string) => new Request("https://jig.example/x", { method: "POST", body });
  expect(readText(post("x".repeat(101)), 100)).rejects.toBeInstanceOf(BodyTooLarge);
  expect(await readText(post("héllo"), 100)).toBe("héllo");
  expect(await readText(new Request("https://jig.example/x"), 100)).toBe("");
});
