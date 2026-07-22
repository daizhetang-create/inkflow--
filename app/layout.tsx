import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? protocol + "://" + host : "https://inkflow-focus.pages.dev";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "墨流 Inkflow｜为深度阅读留一片安静",
      template: "%s｜墨流 Inkflow",
    },
    description:
      "一个为阅读设计的流动专注计时器，用温和的节律、脑间歇和本地智能建议，陪你读得更深，也休息得更好。",
    applicationName: "墨流 Inkflow",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "墨流",
    },
    formatDetection: { telephone: false },
    openGraph: {
      title: "墨流 Inkflow｜为深度阅读留一片安静",
      description: "专注不是绷紧，而是找到能长久停留的节律。",
      type: "website",
      locale: "zh_CN",
      images: [{ url: socialImage, width: 1536, height: 917, alt: "墨流 Inkflow" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "墨流 Inkflow",
      description: "为阅读设计的流动专注计时器。",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0e7" },
    { media: "(prefers-color-scheme: dark)", color: "#101b1c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
