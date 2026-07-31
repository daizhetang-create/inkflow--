import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "墨流｜今天的节奏",
    short_name: "墨流",
    description: "专注、休息、冥想、饭后用药提醒和晚间回顾。",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f1eb",
    theme_color: "#f3f1eb",
    orientation: "any",
    lang: "zh-CN",
    categories: ["lifestyle", "productivity", "health"],
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
