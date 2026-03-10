import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search, Pencil, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { departmentLabels } from "@/features/simulator/config";

const ROLES = [
  { value: "employee", label: "Employee" },
  { value: "shift_lead", label: "Shift Lead" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
] as const;

const DEPARTMENTS = [
  { value: "customer_service", label: departmentLabels.customer_service },
  { value: "golf", label: departmentLabels.golf },
  { value: "mod_emergency", label: departmentLabels.mod_emergency },
];

const roleColors: Record<string, string> = {
  employee: "text-muted-foreground bg-muted/20",
  shift_lead: "text-amber-400 bg-amber-500/10",
  manager: "text-teal bg-teal/10",
  admin: "text-purple-400 bg-purple-500/10",
  super_admin: "text-red-400 bg-red-500/10",
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | typeof ROLES[number]["value"]>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editUser, setEditUser] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    openId: "",
    name: "",
    email: "",
    role: "employee",
    department: "none",
    managerId: "none",
    isActive: true,
  });

  const queryInput = useMemo<{
    search?: string;
    role?: typeof ROLES[number]["value"];
    isActive?: boolean;
  }>(() => ({
    ...(search ? { search } : {}),
    ...(roleFilter !== "all" ? { role: roleFilter } : {}),
    ...(statusFilter === "active" ? { isActive: true } : {}),
    ...(statusFilter === "inactive" ? { isActive: false } : {}),
  }), [search, roleFilter, statusFilter]);

  const usersList = trpc.admin.listUsers.useQuery(queryInput, { retry: false });
  const managers = trpc.admin.getManagers.useQuery(undefined, { retry: false });
  const createUser = trpc.admin.createUser.useMutation({
    onSuccess: () => {
      toast.success("User created");
      setCreateOpen(false);
      setNewUser({
        openId: "",
        name: "",
        email: "",
        role: "employee",
        department: "none",
        managerId: "none",
        isActive: true,
      });
      usersList.refetch();
      managers.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateUser = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("User updated");
      setEditUser(null);
      usersList.refetch();
      managers.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (usersList.isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (usersList.isError) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-red-400 text-sm">Failed to load users. You may not have admin access.</p>
        </CardContent>
      </Card>
    );
  }

  const data = usersList.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.length} user{data.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-teal text-slate-deep hover:bg-teal/90 gap-2"
        >
          <Plus className="h-4 w-4" />
          New User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "all" | typeof ROLES[number]["value"])}>
          <SelectTrigger className="w-40 bg-card border-border">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-card border-border">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      {data.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No users found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-mono text-muted-foreground tracking-wider uppercase">
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Department</div>
            <div className="col-span-2">Last Active</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {data.map((u: any) => (
            <div
              key={u.id}
              className={`grid grid-cols-12 gap-3 px-4 py-3 panel items-center ${!u.isActive ? "opacity-50" : ""}`}
            >
              <div className="col-span-3">
                <div className="text-sm font-medium truncate">{u.name || "Unnamed"}</div>
                <div className="text-[10px] text-muted-foreground truncate">{u.email || `ID: ${u.id}`}</div>
              </div>
              <div className="col-span-2">
                <Badge variant="outline" className={`text-[10px] border-0 ${roleColors[u.role] || ""}`}>
                  {ROLES.find(r => r.value === u.role)?.label || u.role}
                </Badge>
              </div>
              <div className="col-span-2 text-xs text-muted-foreground capitalize">
                {u.department ? departmentLabels[u.department as keyof typeof departmentLabels] : "—"}
              </div>
              <div className="col-span-2 text-xs text-muted-foreground">
                {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "Never"}
              </div>
              <div className="col-span-1">
                <Badge variant="outline" className={`border-0 text-[10px] ${u.isActive ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                  {u.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditUser({ ...u })}
                  className="gap-1 text-xs"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">SSO / OpenID Subject</Label>
              <Input
                value={newUser.openId}
                onChange={(e) => setNewUser({ ...newUser, openId: e.target.value })}
                placeholder="auth0|123456789"
                className="bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs">Full Name</Label>
              <Input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Jamie Trainer"
                className="bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="jamie@woodinvillesportsclub.com"
                className="bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Select
                value={newUser.department}
                onValueChange={(value) => setNewUser({ ...newUser, department: value })}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Department</SelectItem>
                  {DEPARTMENTS.map((department) => (
                    <SelectItem key={department.value} value={department.value}>
                      {department.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Manager</Label>
              <Select
                value={newUser.managerId}
                onValueChange={(value) => setNewUser({ ...newUser, managerId: value })}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Manager</SelectItem>
                  {(managers.data || []).map((manager: any) => (
                    <SelectItem key={manager.id} value={String(manager.id)}>
                      {manager.name || `Manager #${manager.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Active</Label>
              <Switch
                checked={newUser.isActive}
                onCheckedChange={(value) => setNewUser({ ...newUser, isActive: value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newUser.openId.trim()) {
                  toast.error("OpenID / SSO subject is required");
                  return;
                }

                createUser.mutate({
                  openId: newUser.openId.trim(),
                  name: newUser.name.trim() || undefined,
                  email: newUser.email.trim() || undefined,
                  role: newUser.role as any,
                  department: newUser.department === "none" ? null : (newUser.department as any),
                  managerId: newUser.managerId === "none" ? null : parseInt(newUser.managerId, 10),
                  isActive: newUser.isActive,
                });
              }}
              disabled={createUser.isPending}
              className="bg-teal text-slate-deep hover:bg-teal/90"
            >
              {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Edit User: {editUser.name || `#${editUser.id}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Role</Label>
                <Select
                  value={editUser.role}
                  onValueChange={(v) => setEditUser({ ...editUser, role: v })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select
                  value={editUser.department || "none"}
                  onValueChange={(v) => setEditUser({ ...editUser, department: v === "none" ? null : v })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Department</SelectItem>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Manager</Label>
                <Select
                  value={editUser.managerId ? String(editUser.managerId) : "none"}
                  onValueChange={(v) => setEditUser({ ...editUser, managerId: v === "none" ? null : parseInt(v) })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {(managers.data || []).map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name || `Manager #${m.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Active</Label>
                <Switch
                  checked={editUser.isActive}
                  onCheckedChange={(v) => setEditUser({ ...editUser, isActive: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  updateUser.mutate({
                    userId: editUser.id,
                    role: editUser.role,
                    department: editUser.department,
                    managerId: editUser.managerId,
                    isActive: editUser.isActive,
                  });
                }}
                disabled={updateUser.isPending}
                className="bg-teal text-slate-deep hover:bg-teal/90"
              >
                {updateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
