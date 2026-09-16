import type { Metadata } from "next";
import { Suspense } from "react";
import { Montserrat, Open_Sans, Pacifico } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { NavigationProgress } from "@/components/layout/navigation-progress";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const pacifico = Pacifico({
  variable: "--font-pacifico",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Sunbuild CRM",
  description: "Sunview Homes construction management CRM",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${openSans.variable} ${pacifico.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
