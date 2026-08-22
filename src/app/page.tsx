import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="home-party relative isolate grid place-items-center px-6 py-16 sm:px-10">
      <div aria-hidden="true" className="party-confetti z-0">
        <span /><span /><span /><span /><span /><span />
      </div>
      <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <span aria-hidden="true" className="party-brand-mark grid size-11 place-items-center rounded-xl font-black">B</span>
            <span className="font-black tracking-[-0.03em] text-[var(--ink)]">Birthday canvas</span>
          </div>
          <p className="mb-4 inline-flex -rotate-1 rounded-full border-2 border-[var(--ink)] bg-[var(--party-yellow)] px-4 py-2 text-xs font-black tracking-[0.16em] text-[var(--ink)] shadow-[3px_3px_0_var(--party-blue)]">
            MAKE A WISH!
          </p>
          <h1 className="max-w-2xl font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-5xl font-black leading-[1.03] tracking-[-0.06em] text-[var(--ink)] sm:text-7xl">
            오늘의 주인공을<br />더 크게 <span className="text-[var(--brand)]">축하해요.</span>
          </h1>
          <p className="mt-7 max-w-lg text-base font-medium leading-7 text-[var(--ink-muted)] sm:text-lg">
            사진과 마음을 원하는 만큼 담아, 세상에 하나뿐인 생일 카드를 직접 꾸며보세요.
          </p>
          <Link
            href="/editor/local-demo"
            className="party-cta mt-9 inline-flex min-h-14 items-center gap-3 rounded-2xl border-2 border-[var(--ink)] bg-[var(--brand)] px-6 py-3 font-black text-white shadow-[6px_6px_0_var(--ink)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--party-yellow)]"
          >
            내 생일 카드 만들기 <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="mx-auto w-full max-w-[410px] px-8 pb-10">
          <div className="home-card-preview aspect-[4/5] rounded-[2rem] bg-[var(--surface)] p-6 sm:p-8">
            <div className="flex items-center justify-between text-xs font-black tracking-[0.14em] text-[var(--brand)]">
              <span>HAPPY DAY</span><span aria-hidden="true">✦</span>
            </div>
            <div className="mt-8 grid aspect-square place-items-center rounded-[1.5rem] bg-[linear-gradient(145deg,var(--party-yellow),#fff2a8)]">
              <span aria-hidden="true" className="text-8xl">🎂</span>
            </div>
            <p className="mt-7 font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-3xl font-black leading-tight tracking-[-0.04em] text-[var(--ink)]">오늘은<br />네가 주인공!</p>
            <div className="mt-5 flex gap-2" aria-hidden="true">
              <span className="h-3 w-16 rounded-full bg-[var(--brand)]" />
              <span className="size-3 rounded-full bg-[var(--party-mint)]" />
              <span className="size-3 rounded-full bg-[var(--party-blue)]" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
