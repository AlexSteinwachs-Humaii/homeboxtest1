import { afterEach, describe, expect, test } from "vitest";
import { Requests } from "./requests";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Requests headers", () => {
  test("an explicit X-Tenant overrides the client default and authorization still wins", async () => {
    let headers: Record<string, string> = {};
    globalThis.fetch = async (_url, init) => {
      headers = { ...(init?.headers as Record<string, string>) };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const requests = new Requests("", () => "Bearer token", { "X-Tenant": "default-group" });
    await requests.get({
      url: "/api/v1/groups",
      headers: { "X-Tenant": "other-group", Authorization: "should-not-stick" },
    });

    expect(headers["X-Tenant"]).toBe("other-group");
    expect(headers.Authorization).toBe("Bearer token");
  });
});
