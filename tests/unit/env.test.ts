import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("zod basic", () => {
  it("validates email", () => {
    expect(() => z.string().email().parse("a@b.com")).not.toThrow();
  });
});
