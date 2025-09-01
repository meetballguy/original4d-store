export default async (req: Request, ctx: any) => {
  const envKey = Deno.env.get("INDEXNOW_KEY") || "";
  const { file } = ctx.params || {};

  // Jika nama file persis sama dengan key → layani key file
  if (envKey && file === envKey) {
    return new Response(envKey, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // BUKAN key → teruskan ke static file (robots.txt, dll)
  return await ctx.next();
};
