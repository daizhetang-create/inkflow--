import type { Metadata, Viewport } from "next";
import "./zero.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://inkflow-reading-2026.chichub.chatgpt.site"),
  title: "墨流 Inkflow｜把时间交给一件事",
  description: "从现在或某个时间开始，留下一段时间，只做一件具体的事。",
  applicationName: "墨流 Inkflow",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "墨流" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "墨流 Inkflow｜把时间交给一件事",
    description: "不用整理整个人生。只决定下一段。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og-zero-v6.png", width: 1536, height: 1024, alt: "墨流 Inkflow · 把时间交给一件事" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "墨流 Inkflow",
    description: "不用整理整个人生。只决定下一段。",
    images: ["/og-zero-v6.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f5f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
