import type { Metadata, Viewport } from "next";
import "./zero.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://inkflow-reading-2026.chichub.chatgpt.site"),
  title: "墨流｜今天的节奏",
  description: "一个只为日常服务的个人应用：专注、自动休息、两次冥想、饭后用药提醒与晚间回顾。",
  applicationName: "墨流 Inkflow",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "墨流" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "墨流｜今天的节奏",
    description: "专注一段，休息一下，照顾好每天该做的小事。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "墨流 · 今天的节奏" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "墨流｜今天的节奏",
    description: "专注一段，休息一下，照顾好每天该做的小事。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f1eb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
