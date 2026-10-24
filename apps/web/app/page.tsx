export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">
          Phase 1 · Repository foundation
        </p>
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl dark:text-slate-50">
          MERNPress
        </h1>
        <p className="max-w-2xl text-pretty text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          The public site is running. This is a bootable placeholder, not a CMS feature: content,
          themes and rendering arrive in later phases.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          className="rounded-xl border border-slate-300 bg-white/70 p-5 transition-colors hover:border-amber-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-amber-400"
          href="http://localhost:5173"
        >
          <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400">
            Admin application
          </span>
          <span className="mt-1 block text-base font-medium text-slate-900 dark:text-slate-100">
            Open the admin placeholder →
          </span>
        </a>

        <a
          className="rounded-xl border border-slate-300 bg-white/70 p-5 transition-colors hover:border-amber-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-amber-400"
          href="http://127.0.0.1:4000/api/health"
        >
          <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400">
            API liveness
          </span>
          <span className="mt-1 block text-base font-medium text-slate-900 dark:text-slate-100">
            Open /api/health →
          </span>
        </a>
      </div>

      <p className="border-t border-slate-300 pt-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No authentication, content CRUD, editor, media, taxonomy, theme or plugin runtime exists in
        this phase.
      </p>
    </main>
  );
}
