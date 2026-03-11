import { useLocation } from "wouter";
import { Home, Dumbbell, ClipboardList, User } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Dumbbell, label: "Practice", path: "/practice" },
  { icon: ClipboardList, label: "Assignments", path: "/assignments" },
  { icon: User, label: "Profile", path: "/profile" },
];

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const { user, actorUser, impersonation, refresh } = useAuth();
  const [location, setLocation] = useLocation();
  const stopImpersonation = trpc.auth.stopImpersonation.useMutation({
    onSuccess: async () => {
      await refresh();
      setLocation("/manage");
      toast.success("Returned to the admin console");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  // Hide bottom nav during active practice session
  const hideNav = location === "/practice/session" || location === "/practice/intro" || location === "/practice/live";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {impersonation?.active && (
        <div className="sticky top-0 z-50 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                Employee Test View
              </div>
              <div className="truncate text-sm text-foreground">
                Viewing as {user?.name || user?.email || "Employee"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                Admin account: {actorUser?.name || actorUser?.email || "Admin"}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-500/30 bg-background/70"
              disabled={stopImpersonation.isPending}
              onClick={() => stopImpersonation.mutate()}
            >
              Return To Admin
            </Button>
          </div>
        </div>
      )}

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
