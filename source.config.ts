import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  mdxOptions: {
    preset: "fumadocs",
    rehypeCodeOptions: {
      langAlias: {
        // Noir has no Shiki grammar; it is syntactically close to Rust.
        noir: "rust",
      },
      themes: {
        light: "github-light",
        dark: "github-dark-default",
      },
    },
  },
});
