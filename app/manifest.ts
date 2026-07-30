import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "墨流 Inkflow｜今日时间计划",
    short_name: "墨流",
    description: "安排任务、开始时间与时长，用清晰计时把今天真正带到行动。",
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
