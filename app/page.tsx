import Navigation from "@/components/Navigation";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="flex min-h-screen">
        <Navigation />
        <main className="flex-1 bg-zinc-50" />
      </div>
    </div>
  );
}
