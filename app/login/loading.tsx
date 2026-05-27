import { PageLoader } from "@/components/PageLoader";

export default function LoginLoading() {
  return (
    <div className="auth-bg">
      <PageLoader label="Opening Chronicle" detail="Preparing sign in" />
    </div>
  );
}
