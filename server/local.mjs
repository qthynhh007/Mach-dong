import { createServer } from "node:http";
import { Readable } from "node:stream";
import worker from "./worker.mjs";

const host = "127.0.0.1";
const port = 8787;
const origin = `http://${host}:${port}`;

const server = createServer(async (incoming, outgoing) => {
  if (incoming.headers.host !== `${host}:${port}`) {
    outgoing.writeHead(421);
    outgoing.end();
    return;
  }
  try {
    const method = incoming.method;
    const request = new Request(origin + incoming.url, {
      method,
      headers: incoming.headers,
      ...(method === "GET" || method === "HEAD"
        ? {}
        : { body: Readable.toWeb(incoming), duplex: "half" }),
    });
    const response = await worker.fetch(request, process.env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (outgoing.headersSent) {
      outgoing.destroy();
      return;
    }
    outgoing.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ data: null, error: "Yêu cầu dữ liệu không hợp lệ." }));
  }
});
server.listen(port, host, () => console.log(`Mạch Đồng · máy chủ mô phỏng ${origin}`));
