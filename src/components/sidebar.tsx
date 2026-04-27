"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Linkedin, Inbox, Radar, Webhook, Search, Users, ListTodo, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/accounts", label: "LinkedIn accounts", icon: Linkedin },
  { href: "/inboxes", label: "Inboxes", icon: Inbox },
  { href: "/managed-signals", label: "Intent signals", icon: Webhook },
  { href: "/historical-search", label: "Search history", icon: Search },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/queue", label: "Approval queue", icon: ListTodo },
  { href: "/setup", label: "Setup", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 md:z-30 border-r bg-background">
      <div className="border-b px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary to-violet-500 text-primary-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
          <span className="text-sm">Outreach Starter</span>
        </Link>
        <p className="mt-1 text-[11px] text-muted-foreground">Powered by MyAgentMail</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t p-3 text-[10px] text-muted-foreground">
        <a
          href="https://github.com/kamskans/myagentmail-outreach-starter"
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground"
        >
          ★ Star on GitHub
        </a>
      </div>
    </aside>
  );
}
