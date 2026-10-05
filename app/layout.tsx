import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./nav";
import { enabledModuleNav } from "@/lib/modules/state";
import { SETTING_KEYS, getSetting, getTeamScope } from "@/lib/settings";

// Geist ships no Vietnamese subset, so every ậ / ệ / ữ fell back to the system
// font and words came out in two typefaces at once. Both of these carry it.
const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext", "vietnamese"],
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
  // The team label is part of the identity of what is on screen: with it set,
  // every list is narrowed to that team, and "nothing here" needs to be
  // readable as "nothing here for CTALK" rather than "nothing here at all".
  const team = getTeamScope().label
  const context = project ? { project, board, team } : undefined
  const modules = enabledModuleNav()

  return (
    <html
      lang="vi"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] md:grid-cols-[236px_minmax(0,1fr)]">
          <Nav context={context} modules={modules} />
          {/* `min-w-0`: the column is `1fr`, i.e. `minmax(auto, 1fr)`, so without
              it one long unbreakable line — a code snippet in a review, a long
              branch name — widens `main` past the viewport and the whole page
              scrolls sideways. With it, that content scrolls in its own box. */}
          <main className="mx-auto w-full min-w-0 max-w-[1600px] px-4 pb-16 pt-5 md:px-8 md:pt-7">{children}</main>
        </div>
      </body>
    </html>
  );
}
