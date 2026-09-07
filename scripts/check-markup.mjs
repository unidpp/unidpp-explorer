import { createServer } from "vite";

const server = await createServer({ configFile: "vite.config.ts", server: { middlewareMode: true }, logLevel: "error" });
const data = await server.ssrLoadModule("/src/data.ts");
const world = await data.buildWorld();
const pv = await server.ssrLoadModule("/src/views/passports.ts");
const rv = await server.ssrLoadModule("/src/views/registry.ts");
const tv = await server.ssrLoadModule("/src/views/transform.ts");

const pages = {
  list: pv.renderPassportList(world),
  laptop: pv.renderPassportDetail(world, "laptop"),
  car: pv.renderPassportDetail(world, "car"),
  battery: pv.renderPassportDetail(world, "battery"),
  registry: rv.renderRegistry(world),
  transform: tv.renderTransform(world),
};

let bad = 0;
for (const [name, html] of Object.entries(pages)) {
  for (const tag of ["table", "thead", "tbody", "tr", "td", "th", "div", "span", "ul", "li", "a", "h1", "h2", "h3", "p", "svg", "g"]) {
    const open = (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    if (open !== close) {
      console.error(`MISMATCH ${name}: <${tag}> open=${open} close=${close}`);
      bad++;
    }
  }
  // Unescaped quote inside title attributes would show as &quot; failures; check
  // for raw `title="...\"` artifacts.
  if (/title="[^"]*\\"/.test(html)) {
    console.error(`MISMATCH ${name}: stray backslash-quote in title attribute`);
    bad++;
  }
  console.log(`${name}: ${(html.length / 1024).toFixed(1)} kB rendered`);
}
await server.close();
console.log(bad === 0 ? "tag balance OK" : `${bad} mismatches`);
process.exit(bad === 0 ? 0 : 1);
