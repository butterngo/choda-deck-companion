import { createApiClient } from "shared/api";

const baseUrl =
  typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8080";

export const api = createApiClient({ baseUrl });

export { ApiError } from "shared/api";
