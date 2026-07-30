import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./planner.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://inkflow-reading-2026.chichub.chatgpt.site"),
  title: "墨流 Inkflow｜把今天排成可以开始的几段",
  description: "安排今天要做的事、开始时间与时长，用清晰计时把计划真正带到行动。注意力记录作为独立实验保留。",
  applicationName: "墨流 Inkflow",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "墨流" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "墨流 Inkflow｜把今天排成可以开始的几段",
    description: "安排时间、开始任务、暂停与完成，让今天的每一段都更容易真正开始。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og-planner.png", width: 1536, height: 1024, alt: "墨流 Inkflow 今日时间计划" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "墨流 Inkflow",
    description: "先安排今天，再从一段真实行动开始。",
    images: ["/og-planner.png"],
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
