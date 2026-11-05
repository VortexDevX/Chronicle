import NovelDetail from "@/components/novels/NovelDetail";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <NovelDetail slug={slug}/>; }
