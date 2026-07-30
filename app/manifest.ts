import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "墨流 Inkflow｜日常注意力记录",
    short_name: "墨流",
    description: "实时记录意图、走神、打断与回来，看见注意力真实的一天。",
    start_url: "/",
    display: "standalone",
    background_color: "#f2efe7",
    theme_color: "#f2efe7",
    orientation: "any",
    lang: "zh-CN",
    categories: ["lifestyle", "productivity", "health"],
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
