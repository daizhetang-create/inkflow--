import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "墨流 Inkflow",
    short_name: "墨流",
    description: "为深度阅读设计的流动专注计时器",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e7",
    theme_color: "#193f3a",
    orientation: "any",
    lang: "zh-CN",
    categories: ["productivity", "lifestyle", "education"],
  };
}
