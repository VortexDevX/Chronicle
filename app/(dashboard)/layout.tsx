import type { Metadata } from "next";
import ClientSessionProvider from "@/components/ClientSessionProvider";

export const metadata: Metadata = {
  title: "Private media library",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientSessionProvider>{children}</ClientSessionProvider>;
}
