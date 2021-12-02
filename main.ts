// curl localhost:8080 --verbose --no-buffer

import { readableStreamFromReader } from "https://deno.land/std@0.116.0/streams/mod.ts";

let db: string = "";
let subscribers: Notifiable[] = [];

interface Notifiable {
    notify: () => void;
}

// entry point to db
function add(val: string) {
    db = val;
    for (const subscriber of subscribers) {
        subscriber.notify();
    }
}

for await (const conn of Deno.listen({ port: 8080 })) {
    (async () => {
        const httpConn = Deno.serveHttp(conn);
        for await (const requestEvent of httpConn) {
            console.log("A request accepted.");
            await handler(requestEvent);
            console.log("Connection closed.");
        }
    })();
}

async function handler(requestEvent: Deno.RequestEvent) {
    const req = requestEvent.request;
    const url = new URL(req.url);
    if (url.pathname == "/status" && req.method == "GET") {
        const stream = new ReadableStream<Uint8Array>({
            start: (controller) => {
                // subscribe db
                const subscriber = {
                    notify: () => {
                        controller.enqueue(new TextEncoder().encode(`event: change-status\ndata: {"status": "${db}"}\n\n`));
                    },
                };
                subscribers.push(subscriber);
                console.log("subscribers: ", subscribers);
            },
            cancel: () => {
                // いつ呼ばれる？
                console.log("cancel called");
            },
        });

        try {
            await requestEvent.respondWith(
                new Response(stream, {
                    headers: {
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive",
                        "Content-Type": "text/event-stream",
                    },
                })
            );
        } catch (e) {
            console.log("connection refused.")
            // TODO: とりあえず下記
            subscribers = [];
            console.log("subscribers: ", subscribers);
        }
    } else if (url.pathname == "/status" && req.method == "POST") {
        const data = await req.json();
        console.log(data);
        add(data.status);

        await requestEvent.respondWith(new Response(null, { status: 204 }));
    } else if (url.pathname == "/" && req.method == "GET") {
        const file = await Deno.readFile("./index.html");
        await requestEvent.respondWith(new Response(file));
    }
}
