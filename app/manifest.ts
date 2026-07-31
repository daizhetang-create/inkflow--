import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "墨流 Inkflow｜下一段时间",
    short_name: "墨流",
    description: "从现在或某个时间开始，留下一段时间，只做一件具体的事。",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
    orientation: "any",
    lang: "zh-CN",
    categories: ["lifestyle", "productivity", "health"],
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
