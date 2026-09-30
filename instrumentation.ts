import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const path = request.path.replace(/^\/s\/[^/?#]+/, "/s/…");
  console.error(
    `[jig] ${context.routeType} error on ${request.method} ${path} (${context.routePath})${digest ? ` digest=${digest}` : ""}`,
    error,
  );
};
