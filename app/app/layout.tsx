import type { Metadata } from "next"
import { Geist, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { AppLayout } from "@/components/app-layout"
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Branding matches the Mohala reference app (HAIC-DEMO): tab title "Mohala"
// and the green Mohala flower as the icon (app/icon.svg, picked up by Next.js).
export const metadata: Metadata = {
  title: "Mohala",
  description: "District research with Pua.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <ConvexClientProvider>
          <ThemeProvider>
            <AppLayout>{children}</AppLayout>
          </ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  )
}
