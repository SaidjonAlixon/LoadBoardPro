const base = process.argv[2] || "https://loadboardpro.vercel.app";

async function main() {
  const htmlRes = await fetch(base + "/");
  const html = await htmlRes.text();
  console.log("GET /", htmlRes.status, htmlRes.headers.get("content-type"));
  console.log("html length", html.length);

  const scripts = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  const links = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1]);
  console.log("scripts", scripts);
  console.log("css", links);

  for (const src of [...scripts, ...links]) {
    const url = src.startsWith("http") ? src : base + src;
    const r = await fetch(url);
    const ct = r.headers.get("content-type") || "";
    console.log(src, r.status, ct.split(";")[0], "len", (await r.text()).length);
  }

  const api = await fetch(base + "/api/healthz");
  console.log("GET /api/healthz", api.status, await api.text());
}

main().catch(console.error);
