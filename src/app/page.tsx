import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] p-6">
      <Link
        href="/editor/local-demo"
        className="rounded-full bg-[var(--brand)] px-6 py-3 font-semibold text-white"
      >
        내 생일 카드 만들기
      </Link>
    </main>
  );
}
