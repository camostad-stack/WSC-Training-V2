/*
 * Command Center Design: NavHeader
 * - Dark slate background with subtle bottom border glow
 * - JetBrains Mono for the brand/logo
 * - Status dot indicators for active page
 * - Compact, ops-center feel
 */

import { Link, useLocation } from "wouter";
import { Activity, Play, ClipboardList, Users, User } from "lucide-react";

const navItems = [
  { path: "/", label: "Home", icon: Activity },
  { path: "/practice", label: "Practice", icon: Play },
  { path: "/assignments", label: "Assignments", icon: ClipboardList },
  { path: "/manage", label: "Manager", icon: Users },
  { path: "/profile", label: "Profile", icon: User },
];

export default function NavHeader() {
  const [location] = useLocation();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex items-center justify-between h-14">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-md bg-teal/10 border border-teal/30 flex items-center justify-center group-hover:bg-teal/20 transition-colors duration-150">
            <Activity className="w-4 h-4 text-teal" />
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-xs font-semibold tracking-wider text-teal uppercase leading-none">
              WSC
            </span>
            <span className="text-[10px] text-muted-foreground font-mono tracking-wide leading-none mt-0.5">
              TRAINING APP
            </span>
          </div>
        </Link>

        {/* Nav Items */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location === path;
            return (
              <Link key={path} href={path}>
                <span
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150
                    ${isActive
                      ? "bg-teal/10 text-teal border border-teal/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  {isActive && (
                    <span className="status-dot bg-teal ml-1" />
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
