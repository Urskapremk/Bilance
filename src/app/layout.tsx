import type { Metadata } from "next"
import { Cormorant_Garamond, Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
})

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
})

export const metadata: Metadata = {
  title: "Bilance · Hnatura",
  description:
    "Bilanca stanja in izkaz poslovnega izida po shemi AJPES, v vizualnem jeziku Hnatura.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sl" className={`${inter.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full bg-background font-sans text-foreground">{children}</body>
    </html>
  )
}
