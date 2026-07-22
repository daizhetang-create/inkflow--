import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://inkflow-reading-2026.chichub.chatgpt.site";
  const socialImage = new URL("/og-vnext.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "墨流 Inkflow｜把回来后的第一步，一击接回",
      template: "%s｜墨流 Inkflow",
    },
    description: "为 AI 等待与工作中断设计的注意力连续性工具。离开前封存第一步，回来时不再重新找路。",
    applicationName: "墨流 Inkflow",
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "墨流" },
    formatDetection: { telephone: false },
    openGraph: {
      title: "墨流 Inkflow｜注意力连续性工具",
      description: "等待时放下，完成后一击接回。不是番茄钟，而是你的 Return Gate。",
      type: "website",
      locale: "zh_CN",
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "墨流 Inkflow 注意力连续性工具" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "墨流 Inkflow",
      description: "把回来后的第一步，一击接回。",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#11110f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
