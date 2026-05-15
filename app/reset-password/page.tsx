import ResetPasswordForm from "@/components/ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";

  return <ResetPasswordForm token={token} />;
}
