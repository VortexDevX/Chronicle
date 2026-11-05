import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
export async function requireServerSession(admin = false) {
  const claims = verifyAuthToken((await cookies()).get("auth_token")?.value);
  if (!claims) redirect("/login");
  await connectDB();
  const user = await User.findById(claims.userId).select("auth_version is_admin");
  if (!user || (user.auth_version || 0) !== claims.authVersion) redirect("/login");
  if (admin && !user.is_admin) redirect("/novels");
  return String(user._id);
}
