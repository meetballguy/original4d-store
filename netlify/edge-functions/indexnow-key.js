export default async (req, ctx) => {
  const envKey = Deno.env.get("INDEXNOW_KEY") || "";
  const { key } = ctx.params || {};

  if (envKey && key === envKey) {
    return new Response(envKey, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // BUKAN file key → teruskan ke static file (robots.txt, dll)
  return await ctx.next();
};
