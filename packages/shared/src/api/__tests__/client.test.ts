import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "../index.js";
import { ApiError } from "../errors.js";

function makeFetch(status: number, body: unknown) {
  const text =
    typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  });
}

describe("createApiClient", () => {
  it("injects auth header when getAuthHeader is provided", async () => {
    const mockFetch = makeFetch(200, []);
    const client = createApiClient({
      baseUrl: "http://localhost",
      getAuthHeader: () => ({ Authorization: "Bearer test-token" }),
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    await client.listTasks();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("omits auth header when getAuthHeader is not provided", async () => {
    const mockFetch = makeFetch(200, []);
    const client = createApiClient({
      baseUrl: "http://localhost",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    await client.listTasks();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("throws ApiError on non-2xx response", async () => {
    const mockFetch = makeFetch(401, "Unauthorized");
    const client = createApiClient({
      baseUrl: "http://localhost",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    await expect(client.listTasks()).rejects.toBeInstanceOf(ApiError);
  });

  it("ApiError carries status code", async () => {
    const mockFetch = makeFetch(404, "Not Found");
    const client = createApiClient({
      baseUrl: "http://localhost",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const err = await client.listTasks().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});
