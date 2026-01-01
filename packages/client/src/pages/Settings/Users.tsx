import { useState } from "react";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { trpc } from "../../trpc";

export default function Users() {
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  const { data: users, isLoading } = trpc.auth.listUsers.useQuery();
  const utils = trpc.useUtils();

  const setAdminMutation = trpc.auth.setAdmin.useMutation({
    onSuccess: () => {
      utils.auth.listUsers.invalidate();
      setProcessingUserId(null);
    },
    onError: (error) => {
      alert(`Failed to update admin status: ${error.message}`);
      setProcessingUserId(null);
    },
  });

  const setEnabledMutation = trpc.auth.setEnabled.useMutation({
    onSuccess: () => {
      utils.auth.listUsers.invalidate();
      setProcessingUserId(null);
    },
    onError: (error) => {
      alert(`Failed to update user status: ${error.message}`);
      setProcessingUserId(null);
    },
  });

  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? "demote" : "promote";
    if (
      !confirm(
        `Are you sure you want to ${action} this user ${currentStatus ? "from" : "to"} admin?`
      )
    ) {
      return;
    }

    setProcessingUserId(userId);
    try {
      await setAdminMutation.mutateAsync({
        userId,
        isAdmin: !currentStatus,
      });
    } catch (_error) {
      // Error already handled in onError
    }
  };

  const handleToggleEnabled = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? "disable" : "enable";
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    setProcessingUserId(userId);
    try {
      await setEnabledMutation.mutateAsync({
        userId,
        enabled: !currentStatus,
      });
    } catch (_error) {
      // Error already handled in onError
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Users</h1>
        </div>
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Users</h1>
        </div>
        <EmptyState title="No users found" description="No users have been created yet" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <div className="text-sm text-white/60">
          {users.length} {users.length === 1 ? "user" : "users"}
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">
                  Account Type
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isProcessing = processingUserId === user.id;

                return (
                  <tr
                    key={user.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.username}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-annex-500/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-annex-400">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-white">{user.username}</div>
                          {user.plexAccount && (
                            <div className="text-xs text-white/50">
                              Plex: {user.plexAccount.plexUsername}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-white/70">
                        {user.email || <span className="text-white/40">Not set</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {user.plexAccount ? (
                        <Badge variant="info">Plex</Badge>
                      ) : (
                        <Badge variant="info">Emby</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {user.isAdmin ? (
                        <Badge className="bg-annex-500/20 text-annex-400 border-annex-500/30">
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="default">User</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {user.enabled ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          Enabled
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          Disabled
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={user.isAdmin ? "secondary" : "primary"}
                          onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                          disabled={isProcessing}
                        >
                          {user.isAdmin ? "Demote" : "Promote"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleToggleEnabled(user.id, user.enabled)}
                          disabled={isProcessing}
                        >
                          {user.enabled ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded">
        <h3 className="text-sm font-medium text-white mb-2">About User Management</h3>
        <ul className="text-sm text-white/60 space-y-1">
          <li>Admins have full access to all settings and can manage other users</li>
          <li>Users can only request and view media</li>
          <li>Disabled users cannot log in or access the system</li>
          <li>You cannot remove your own admin status or disable your own account</li>
        </ul>
      </div>
    </div>
  );
}
