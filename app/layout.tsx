import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://inkflow-reading-2026.chichub.chatgpt.site"),
  title: "墨流 Inkflow｜看见注意力真实的一天",
  description: "实时记下此刻的意图、走神、打断与回来。墨流不是另一个计时器，而是一份只属于你的日常注意力记录。",
  applicationName: "墨流 Inkflow",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "墨流" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "墨流 Inkflow｜看见注意力真实的一天",
    description: "从一句“我现在要做什么”开始，留下走神、打断与回来的真实轨迹。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og-daily.png", width: 1536, height: 1024, alt: "墨流 Inkflow 日常注意力记录" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "墨流 Inkflow",
    description: "不是计时器，是你一天真实的注意力轨迹。",
    images: ["/og-daily.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2efe7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
