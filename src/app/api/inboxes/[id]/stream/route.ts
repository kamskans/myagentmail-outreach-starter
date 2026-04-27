/**
 * Server-Sent Events bridge — keeps the master key on the server.
 *
 * The browser opens an EventSource to this route. We open a WebSocket
 * out to MyAgentMail using the master key, subscribe to events for the
 * requested inbox, and forward each event back to the browser as an
 * SSE frame. When the browser disconnects (tab close, unmount), we
 * close the upstream WebSocket too.
 *
 * Why SSE vs giving the browser a direct WebSocket: a direct ws would
 * require shipping the master key (or a scoped key) to the client. SSE
 * keeps every byte of auth on the server.
 *
 * Node 22 has globalThis.WebSocket as a client — no `ws` dep needed.
 * Auth uses ?api_key= because the global client doesn't support custom
 * headers; the URL is composed inside our server process and never
 * reaches the browser.
 */

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = process.env.MYAGENTMAIL_BASE_URL || "https://myagentmail.com";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = process.env.MYAGENTMAIL_API_KEY;
  if (!apiKey) {
    return new Response("MYAGENTMAIL_API_KEY not set", { status: 500 });
  }

  const wsUrl = `${BASE.replace(/^http/, "ws")}/v1/ws?api_key=${encodeURIComponent(apiKey)}`;

  const encoder = new TextEncoder();
  let upstream: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Browser disconnected — controller already closed.
        }
      };

      // Initial SSE handshake. Browsers buffer up to ~2KB before
      // surfacing the first event, so a comment frame primes the
      // pipeline immediately.
      send(`: stream open\n\n`);

      // Reconnect-friendly heartbeat — also keeps Coolify/Cloudflare
      // from idling the SSE connection at ~30s.
      heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      try {
        upstream = new WebSocket(wsUrl);
      } catch (err: any) {
        send(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        controller.close();
        return;
      }

      upstream.addEventListener("open", () => {
        upstream?.send(
          JSON.stringify({
            type: "subscribe",
            event_types: ["message.received", "message.sent", "message.bounced"],
            inbox_ids: [params.id],
          }),
        );
      });

      upstream.addEventListener("message", (e: MessageEvent) => {
        // Forward every server frame verbatim to the browser as an
        // SSE event with the upstream type as the event name. The
        // client filters on this field.
        let frame: any;
        try {
          frame = JSON.parse(typeof e.data === "string" ? e.data : String(e.data));
        } catch {
          return;
        }
        const eventName = frame.type === "event" ? frame.event_type : frame.type;
        send(`event: ${eventName}\ndata: ${JSON.stringify(frame)}\n\n`);
      });

      upstream.addEventListener("close", (e: CloseEvent) => {
        send(`event: close\ndata: ${JSON.stringify({ code: e.code, reason: e.reason })}\n\n`);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      upstream.addEventListener("error", () => {
        send(`event: error\ndata: ${JSON.stringify({ message: "upstream websocket error" })}\n\n`);
      });
    },
    cancel() {
      // Browser tab closed / EventSource.close() called.
      if (heartbeat) clearInterval(heartbeat);
      if (upstream && upstream.readyState <= 1) {
        try {
          upstream.close(1000, "client disconnected");
        } catch {
          // ignore
        }
      }
    },
  });

  // Tear down upstream when the request itself is aborted (HTTP/2
  // RST_STREAM, fetch().signal abort, deployment shutdown).
  req.signal.addEventListener("abort", () => {
    if (heartbeat) clearInterval(heartbeat);
    if (upstream && upstream.readyState <= 1) {
      try {
        upstream.close(1001, "request aborted");
      } catch {
        // ignore
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
