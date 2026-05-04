"use client";
import ClientSessionProvider from "@/components/ClientSessionProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientSessionProvider>{children}</ClientSessionProvider>;
}
