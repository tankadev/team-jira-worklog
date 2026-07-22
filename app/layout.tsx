import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./nav";
import { enabledModuleNav } from "@/lib/modules/state";
import { SETTING_KEYS, getSetting } from "@/lib/settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  // Geist has no "vietnamese" subset; latin-ext carries the diacritics.
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  // Geist has no "vietnamese" subset; latin-ext carries the diacritics.
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Jira Logwork",
  description: "Log work và tạo daily report cho Jira",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reflects the configured project rather than a hardcoded one, so the app
  // reads correctly for whoever runs it.
  const project = getSetting(SETTING_KEYS.jiraProjectKey)
  const board = getSetting(SETTING_KEYS.jiraBoardId)
  const label = project ? `${project}${board ? ` · board ${board}` : ''}` : undefined
  const modules = enabledModuleNav()

  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="grid min-h-screen grid-cols-1 md:grid-cols-[196px_1fr]">
          <Nav label={label} modules={modules} />
          <main className="max-w-[1340px] px-6 pb-12 pt-5">{children}</main>
        </div>
      </body>
    </html>
  );
}
