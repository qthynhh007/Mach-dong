import { readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "tailwindcss";

const pages = {
  community: ["community/index.html"],
  simulation: ["simulation/index.html"],
  auth: ["auth/login.html", "auth/register.html"],
  profile: ["auth/profile.html"],
  "forum-feed": ["forum/base.html", "forum/index.html"],
  "forum-compose": ["forum/base.html", "forum/compose.html"],
  "forum-detail": ["forum/base.html", "forum/detail.html"],
};
for (const [page, templates] of Object.entries(pages)) {
  const settings = JSON.parse(await readFile(new URL(`./tailwind-${page}.json`, import.meta.url), "utf8"));
  const content = await Promise.all(templates.map(async (name) => ({
    raw: await readFile(new URL(`../src/views/${name}`, import.meta.url), "utf8"),
    extension: "html",
  })));
  const styles = await postcss([tailwind({ ...settings, content })])
    .process("@tailwind base;\n@tailwind components;\n@tailwind utilities;", { from: undefined });
  await writeFile(new URL(`../src/static/${page}.css`, import.meta.url), styles.css);
}
