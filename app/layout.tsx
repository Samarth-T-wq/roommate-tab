import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

// Default title; once a household loads, Header sets the tab title to the household's name.
export const metadata: Metadata = {
  title: "Roommate Tab",
  description: "Shared shopping list and who-owes-who for roommates",
};

export const viewport: Viewport = {
  themeColor: "#fff9f0",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-page font-sans text-ink">{children}</body>
    </html>
  );
}
