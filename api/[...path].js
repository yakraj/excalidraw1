const HEALTH_PATHS = new Set(["/api/health", "/health"]);

const getPathname = (req) => {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return req.url || "/";
  }
};

export default async function handler(req, res) {
  const pathname = getPathname(req);

  if (HEALTH_PATHS.has(pathname)) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, runtime: "vercel-function" }));
    return;
  }

  const { default: requestHandler } = await import(
    "../cloud-backend/server.mjs"
  );
  return requestHandler(req, res);
}
