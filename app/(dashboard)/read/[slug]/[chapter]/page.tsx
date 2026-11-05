import Reader from "@/components/novels/Reader";
export default async function Page({ params }: { params: Promise<{ slug: string; chapter: string }> }) { const { slug, chapter } = await params; return <Reader key={slug + chapter} slug={slug} chapterNumber={Number(chapter)}/>; }
