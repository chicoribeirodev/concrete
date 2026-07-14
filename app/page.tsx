import Link from "next/link";
import Navigation from "@/components/Navigation";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 bg-zinc-50 p-8 lg:p-12">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
                Welcome
              </p>
            </div>
            <Link
              href="/projects"
              className="inline-flex w-fit items-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Open projects page
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
