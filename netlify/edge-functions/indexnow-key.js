export default async (request) => {
  const key = Deno.env.get("INDEXNOW_KEY") || "";
  const url = new URL(request.url);
  const requested = url.pathname.replace(/^\//, "");
  // Hanya respon bila path == "<KEY>.txt"
  if (!key || requested !== `${key}.txt`) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(key, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
};
