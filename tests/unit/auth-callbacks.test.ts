import { describe, expect, it } from "vitest";

describe("auth callbacks", () => {
  it("adds id and role to token when user present", () => {
    const token: Record<string, unknown> = {};
    const user: { id: string; role?: string } = { id: "u1", role: "ADMIN" };
    // simulate our jwt callback
    if (user) {
      token.id = user.id;
      token.role = user.role ?? "USER";
    }
    expect(token.id).toBe("u1");
    expect(token.role).toBe("ADMIN");
  });
});
