import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "./globals.css";

const defaultUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "Grand Citizens | Iftaar Drive Volunteer Management Portal",
    template: "%s | Grand Citizens",
  },
  description:
    "Manage volunteers, assign duties, and coordinate Iftaar drives with the Grand Citizens portal. Sign up, get assignments, and stay connected.",
  openGraph: {
    title: "Grand Citizens | Iftaar Drive Volunteer Management Portal",
    description:
      "Manage volunteers, assign duties, and coordinate Iftaar drives with the Grand Citizens portal. Sign up, get assignments, and stay connected.",
    siteName: "Grand Citizens",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Grand Citizens | Iftaar Drive Volunteer Management Portal",
    description:
      "Manage volunteers, assign duties, and coordinate Iftaar drives with the Grand Citizens portal. Sign up, get assignments, and stay connected.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GC Iftaar",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#091017" },
  ],
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
