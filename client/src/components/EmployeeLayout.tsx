import { useLocation } from "wouter";
import { Home, Dumbbell, ClipboardList, User } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Dumbbell, label: "Practice", path: "/practice" },
  { icon: ClipboardList, label: "Assignments", path: "/assignments" },
  { icon: User, label: "Profile", path: "/profile" },
];

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  // Hide bottom nav during active practice session
  const hideNav = location === "/practice/session" || location === "/practice/intro" || location === "/practice/live";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className={`flex-1 ${hideNav ? "" : "pb-20"}`}>
        {children}
      </main>

      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
          <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                    active
                      ? "text-teal"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${active ? "text-teal" : ""}`} />
                  <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
