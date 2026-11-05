import NovelUpload from "@/components/novels/Upload";
import { requireServerSession } from "@/lib/serverSession";
export default async function Page() { await requireServerSession(true); return <NovelUpload/>; }
