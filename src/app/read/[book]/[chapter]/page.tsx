import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TRANSLATIONS, activeTranslation, getChapter, getChapterCounts } from "@/lib/bible/text";
import { Reader } from "@/components/reader/Reader";

type Params = Promise<{ book: string; chapter: string }>;

export default function ReadPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ReaderSkeleton />}>
      <ChapterLoader params={params} />
    </Suspense>
  );
}

async function ChapterLoader({ params }: { params: Params }) {
  const { book, chapter } = await params;
  const translation = activeTranslation();
  const data = await getChapter(translation, book, Number(chapter));
  if (!data) notFound();
  if (book !== data.book || chapter !== String(data.chapter)) redirect(`/read/${data.book}/${data.chapter}`);

  const counts = await getChapterCounts(translation);
  const t = TRANSLATIONS[translation];
  return (
    <Reader
      key={`${data.book}.${data.chapter}`}
      initial={data}
      chapterCounts={counts}
      translationName={t.name}
      notice={t.notice}
    />
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-5 pt-24 sm:px-8">
      <div className="mb-6 h-10 w-24 rounded bg-line" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="mb-4 h-4 rounded bg-line" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}
