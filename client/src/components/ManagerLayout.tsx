import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ClipboardList,
  Shield,
  FileText,
  ScrollText,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/manage" },
  { icon: Users, label: "Team", path: "/manage/team" },
  { icon: MessageSquare, label: "Sessions", path: "/manage/sessions" },
  { icon: ClipboardList, label: "Assignments", path: "/manage/assignments" },
  { icon: Shield, label: "Users", path: "/manage/users", adminOnly: true },
  { icon: FileText, label: "Scenarios", path: "/manage/scenarios", adminOnly: true },
  { icon: ScrollText, label: "Policies", path: "/manage/policies", adminOnly: true },
  { icon: Shield, label: "Audit", path: "/manage/audit", adminOnly: true },
] as const;

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) => {
    if (path === "/manage") return location === "/manage";
    return location.startsWith(path);
  };

  // If on employee pages, show minimal header instead of sidebar
  const isEmployeePage = !location.startsWith("/manage");
  if (isEmployeePage) {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-14 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50 flex items-center px-4 gap-3">
          <button
            onClick={() => setLocation("/manage")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back to Console</span>
          </button>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium text-foreground">Employee View</span>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-card border-r border-border flex flex-col z-40 transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
            <span className="text-teal font-bold text-sm font-mono">W</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">WSC Training</span>
              <span className="text-[10px] text-muted-foreground font-mono tracking-wider">OPERATIONS</span>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {sidebarItems
            .filter((item) => !('adminOnly' in item && item.adminOnly) || ['admin', 'super_admin'].includes(user?.role || ''))
            .map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-teal/10 text-teal font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                } ${collapsed ? "justify-center" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-teal" : ""}`} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="px-2 py-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary/50 transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* User */}
        <div className="border-t border-border p-3">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-teal/10 text-teal">
                {user?.name?.charAt(0)?.toUpperCase() || "M"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "Manager"}</p>
                <p className="text-[10px] text-muted-foreground truncate font-mono tracking-wider uppercase">
                  {user?.role || "manager"}
                </p>
              </div>
            )}
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={logout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-200 ${collapsed ? "ml-16" : "ml-60"}`}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
