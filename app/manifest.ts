import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "墨流 Inkflow",
    short_name: "墨流",
    description: "为 AI 等待与工作中断设计的注意力连续性工具",
    start_url: "/",
    display: "standalone",
    background_color: "#11110f",
    theme_color: "#11110f",
    orientation: "any",
    lang: "zh-CN",
    categories: ["productivity", "utilities"],
  };
}
