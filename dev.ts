const root = new URL("./", import.meta.url);
const hostname = "0.0.0.0";
const port = 4173;

const types: Readonly<Record<string, string>> = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
});

const extension = (pathname: string) => {
  const match = pathname.match(/\.[a-z0-9]+$/i);
  return match?.[0].toLowerCase() ?? "";
};

const fileUrl = (requestUrl: string) => {
  const url = new URL(requestUrl);
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === "/" ? "./index.html" : `.${pathname}`;
  const target = new URL(relative, root);
  return target.href.startsWith(root.href) ? target : null;
};

const responseFor = async (request: Request) => {
  const target = fileUrl(request.url);
  if (!target) return new Response("Forbidden", { status: 403 });

  try {
    const body = await Deno.readFile(target);
    return new Response(body, {
      headers: {
        "content-type": types[extension(target.pathname)] ??
          "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Server error", { status: 500 });
  }
};

console.log(`Formic lab running at http://${hostname}:${port}`);
Deno.serve({ hostname, port }, responseFor);
