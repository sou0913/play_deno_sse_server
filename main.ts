// curl localhost:8080 --verbose --no-buffer

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

for await (const conn of Deno.listen({ port: 3000 })) {
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
                        "Access-Control-Allow-Origin": "*",
                    },
                })
            );
        } catch (e) {
            console.log("connection refused.")
            // TODO: とりあえず下記
            subscribers = [];
            console.log("subscribers: ", subscribers);
        }
    } else if (url.pathname == "/status" && req.method == "OPTIONS") {
        await requestEvent.respondWith(new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "86400",
            }
        }))
    } else if (url.pathname == "/status" && req.method == "POST") {
        const data = await req.json();
        console.log(data);
        add(data.status);

        await requestEvent.respondWith(new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*"
            }
        }));
    }
}
