import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slate",
  description: "One screen for fantasy leagues across Sleeper, ESPN, and Yahoo.",
};

export const viewport: Viewport = {
  themeColor: "#0f151a",
  width: "device-width",
  initialScale: 1,
};

// Read the saved theme before first paint so Daybreak users don't get a
// dark flash. Tiny and synchronous on purpose.
const THEME_BOOT = `try{var t=localStorage.getItem('slate-theme');if(t==='daybreak'||t==='floodlight')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="floodlight" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col items-center bg-ink text-bone">
        {children}
        <Script
          id="slate-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
        />
      </body>
    </html>
  );
}
