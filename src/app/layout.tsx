import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outreach Starter — MyAgentMail",
  description:
    "Open-source contextual LinkedIn signal monitoring + email outreach, built on MyAgentMail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Sidebar />
        <main className="md:pl-60">
          <div className="px-6 py-6 md:px-10 md:py-8">{children}</div>
        </main>
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
