import { FetchInterceptor } from "@mswjs/interceptors/fetch/web";
import { defineNetwork, InterceptorSource } from "msw/experimental";
import type { HttpHandler } from "msw/http";

export function createNetwork(...handlers: HttpHandler[]) {
  // Bun's native fetch does not use Node's socket interceptors.
  return defineNetwork({
    sources: [
      new InterceptorSource({
        // @ts-expect-error Browser and Node builds declare separate private Interceptor fields.
        interceptors: [new FetchInterceptor()],
      }),
    ],
    handlers,
    onUnhandledFrame: "error",
    context: { quiet: true },
  });
}
