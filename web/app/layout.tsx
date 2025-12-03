import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SoundToggle from "@/app/components/SoundToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forbidden Word Game",
  description: "Play the Forbidden Word guessing game with friends!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Persistent Header with Sound Toggle */}
        <header className="fixed top-0 right-0 z-50 p-4">
          <SoundToggle />
        </header>
        {children}
      </body>
    </html>
  );
}
