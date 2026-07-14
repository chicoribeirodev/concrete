import Link from "next/link";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/projects" }
];

export default function Navigation() {
  return (
    <aside className="flex w-64 flex-col border-r border-zinc-200 bg-white px-5 py-8 shadow-sm" style={{ minHeight: "100vh", position: "sticky", top: 0 }}>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Concrete
        </p>
      </div>
      <nav className="flex flex-col gap-3">
        {navItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
