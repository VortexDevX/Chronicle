import type { Metadata } from "next";
import ClientSessionProvider from "@/components/ClientSessionProvider";
import { requireServerSession } from "@/lib/serverSession";

export const metadata: Metadata = {
  title: "Private media library",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServerSession();
  return <ClientSessionProvider>{children}</ClientSessionProvider>;
}
