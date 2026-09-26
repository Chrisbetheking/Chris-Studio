import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TokenFence Studio",
  description: "Local-first AI workspace and model gateway"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("tokenfence.theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`,
          }}
        />
      </head>
      <body className="transition-colors duration-200">{children}</body>
    </html>
  );
}
