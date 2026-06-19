import "./setupEnv";
import { signSession, verifySession } from "../lib/session";

describe("merchant session JWT", () => {
  it("signs and verifies, binding store_id", () => {
    const token = signSession({ store_id: "999", user_id: "u1" });
    const payload = verifySession(token);
    expect(payload?.store_id).toBe("999");
    expect(payload?.user_id).toBe("u1");
  });

  it("rejects a tampered token", () => {
    const token = signSession({ store_id: "999" });
    const parts = token.split(".");
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ store_id: "1", exp: 9999999999 })).toString("base64url")}.${parts[2]}`;
    expect(verifySession(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession({ store_id: "999", ttlSeconds: -10 });
    expect(verifySession(token)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySession("not.a.token")).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});
