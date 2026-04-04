import Link from "next/link";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/influenciadores", label: "Influenciadores" },
  { href: "/roteiros", label: "Roteiros" },
  { href: "/virais", label: "Virais" },
  { href: "/configuracoes", label: "Configurações" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h1 className="font-semibold text-sm">TikTok Video Copilot</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
