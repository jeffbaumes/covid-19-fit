import { serve } from "https://deno.land/std@0.119.0/http/server.ts";
import * as path from "https://deno.land/std@0.119.0/path/mod.ts";
import { readableStreamFromReader } from "https://deno.land/std@0.119.0/streams/mod.ts";

const port = 8080;

const staticHandler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const urlpath = decodeURIComponent(url.pathname);
  let filepath = path.join("./static", urlpath);
  if (filepath.endsWith(".orig")) {
    filepath = filepath.slice(0, -5);
  }
  let file;
  try {
    file = await Deno.open(filepath, { read: true });
    const stat = await file.stat();
    if (stat.isDirectory) {
      file.close();
      const filePath = path.join(filepath, "index.html");
      file = await Deno.open(filePath, { read: true });
    }
  } catch {
    return new Response("404 Not Found", { status: 404 });
  }
  const readableStream = readableStreamFromReader(file);
  const response = new Response(readableStream);
  if (filepath.endsWith(".js") || filepath.endsWith(".ts")) {
    response.headers.append("Content-Type", "text/javascript");
  }
  return response;
}

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const urlpath = decodeURIComponent(url.pathname);
  if (urlpath === '/hi') {
    return new Response(JSON.stringify({ hi: "there" }), { headers: {"Content-Type": "text/plain"} });
  }
  return staticHandler(request);
};

console.log(`HTTP webserver running. Access it at: http://localhost:8080/`);
await serve(handler, { port });
