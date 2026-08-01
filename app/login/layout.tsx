import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in or create an account",
  description: "Sign in to Chronicle X or create your private media-tracking library.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
