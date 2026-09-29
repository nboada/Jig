import type { Instrumentation } from "next";

/**
 * One line per server error, with the digest the error page shows, so a digest someone reads off
 * the screen finds its error in the logs. A share link's token is a secret, so it's left out.
 * Send these to an error service here if one is ever added.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  const path = request.path.replace(/^\/s\/[^/?#]+/, "/s/…");
  console.error(
    `[jig] ${context.routeType} error on ${request.method} ${path} (${context.routePath})${digest ? ` digest=${digest}` : ""}`,
    error,
  );
};
