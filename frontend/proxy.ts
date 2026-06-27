// proxy.ts
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { trackAICrawlerRequest } from "@datafast/ai-crawl";

export function proxy(request: NextRequest, event: NextFetchEvent) {
  // DataFast AI crawler tracking — fire-and-forget, do NOT await.
  trackAICrawlerRequest(request, event, {
    websiteId: "dfid_dNQW78mhptvPg00g6rV6g",
  });

  return NextResponse.next();
}

export const config = {
  // Skip API routes, static assets, and framework internals.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
