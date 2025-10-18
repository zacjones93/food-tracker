"use client";

import { useEffect, useState } from "react";
import { useServerAction } from "zsa-react";
import {
  getUserTeamsAction,
  getTeamMembersAction,
  getTeamInvitationsAction,
  removeTeamMemberAction,
  updateTeamAction,
  changeMemberRoleAction,
  getMyPendingInvitationsAction,
  getMyTeamsPendingInvitationsAction,
  createTeamAction,
} from "@/actions/team-management.actions";
import {
  createTeamInviteAction,
  cancelTeamInviteAction,
  acceptTeamInviteByIdAction,
  declineTeamInviteAction,
} from "@/actions/team-invites.actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Trash2, UserPlus, X, Crown, Shield, User, Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { SYSTEM_ROLES_ENUM } from "@/db/schema";
import type { Team, TeamMembership, TeamInvitation } from "@/db/schema";
import { Badge } from "@/components/ui/badge";

type TeamWithRole = Team & {
  roleId: string;
  isSystemRole: number;
  joinedAt: Date | null;
};

type MemberWithUser = TeamMembership & {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  invitedByUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type InvitationWithUser = TeamInvitation & {
  invitedByUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
};

type MyInvitation = TeamInvitation & {
  team: Team;
  invitedByUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
};

type OwnerInvitation = TeamInvitation & {
  team: Team;
  invitedByUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
};

const roleIcons = {
  [SYSTEM_ROLES_ENUM.OWNER]: Crown,
  [SYSTEM_ROLES_ENUM.ADMIN]: Shield,
  [SYSTEM_ROLES_ENUM.MEMBER]: User,
  [SYSTEM_ROLES_ENUM.GUEST]: Eye,
};

const roleLabels = {
  [SYSTEM_ROLES_ENUM.OWNER]: "Owner",
  [SYSTEM_ROLES_ENUM.ADMIN]: "Admin",
  [SYSTEM_ROLES_ENUM.MEMBER]: "Member",
  [SYSTEM_ROLES_ENUM.GUEST]: "Guest",
};

export function TeamsManagement() {
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, MemberWithUser[]>>({});
  const [invitations, setInvitations] = useState<Record<string, InvitationWithUser[]>>({});
  const [myInvitations, setMyInvitations] = useState<MyInvitation[]>([]);
  const [ownerInvitations, setOwnerInvitations] = useState<OwnerInvitation[]>([]);

  const { execute: getTeams, isPending: isLoadingTeams } = useServerAction(getUserTeamsAction);
  const { execute: getMembers, isPending: isLoadingMembers } = useServerAction(getTeamMembersAction);
  const { execute: getInvitations, isPending: isLoadingInvitations } = useServerAction(getTeamInvitationsAction);
  const { execute: getMyInvitations } = useServerAction(getMyPendingInvitationsAction);
  const { execute: getOwnerInvitations } = useServerAction(getMyTeamsPendingInvitationsAction);

  useEffect(() => {
    loadTeams();
    loadMyInvitations();
    loadOwnerInvitations();
  }, []);

  const loadTeams = async () => {
    const [data, err] = await getTeams();
    if (err) {
      toast.error(err.message);
      return;
    }
    setTeams(data.teams);
  };

  const loadTeamData = async (teamId: string) => {
    // Load members
    const [membersData, membersErr] = await getMembers({ teamId });
    if (membersErr) {
      toast.error(membersErr.message);
    } else {
      setMembers((prev) => ({ ...prev, [teamId]: membersData.members as MemberWithUser[] }));
    }

    // Load invitations if user is owner/admin
    const [invitationsData, invitationsErr] = await getInvitations({ teamId });
    if (!invitationsErr && invitationsData) {
      setInvitations((prev) => ({ ...prev, [teamId]: invitationsData.invitations as InvitationWithUser[] }));
    }
  };

  const loadMyInvitations = async () => {
    const [data, err] = await getMyInvitations();
    if (err) {
      toast.error(err.message);
      return;
    }
    setMyInvitations(data.invitations as MyInvitation[]);
  };

  const loadOwnerInvitations = async () => {
    const [data, err] = await getOwnerInvitations();
    if (err) {
      toast.error(err.message);
      return;
    }
    setOwnerInvitations(data.invitations as OwnerInvitation[]);
  };

  if (isLoadingTeams) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (teams.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          You are not a member of any teams yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create Team Button */}
      <CreateTeamDialog onTeamCreated={() => loadTeams()} />

      {/* Pending Invitations Received */}
      {myInvitations.length > 0 && (
        <MyPendingInvitations
          invitations={myInvitations}
          onInvitationAccepted={() => {
            loadMyInvitations();
            loadTeams();
          }}
          onInvitationDeclined={() => loadMyInvitations()}
        />
      )}

      {/* Pending Invitations Sent by Teams I Own */}
      {ownerInvitations.length > 0 && (
        <OwnerPendingInvitations
          invitations={ownerInvitations}
          onInvitationCancelled={() => {
            loadOwnerInvitations();
            // Also refresh team data if any team is expanded
            teams.forEach((team) => {
              if (invitations[team.id]) {
                loadTeamData(team.id);
              }
            });
          }}
        />
      )}

      <Accordion type="single" collapsible className="w-full">
        {teams.map((team) => {
          const isOwner = team.roleId === SYSTEM_ROLES_ENUM.OWNER;
          const RoleIcon = roleIcons[team.roleId as keyof typeof roleIcons] || User;

          return (
            <AccordionItem key={team.id} value={team.id}>
              <AccordionTrigger
                onClick={() => {
                  if (!members[team.id]) {
                    loadTeamData(team.id);
                  }
                }}
                className="hover:no-underline"
              >
                <div className="flex items-center gap-3 text-left">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{team.name}</h3>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <RoleIcon className="h-3 w-3" />
                        {roleLabels[team.roleId as keyof typeof roleLabels]}
                      </Badge>
                    </div>
                    {team.description && (
                      <p className="text-sm text-muted-foreground">{team.description}</p>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-6 pt-4">
                  {/* Team Information */}
                  {isOwner && (
                    <TeamInformation
                      team={team}
                      onUpdate={() => loadTeams()}
                    />
                  )}

                  {/* Team Members */}
                  <TeamMembers
                    teamId={team.id}
                    members={members[team.id] || []}
                    isOwner={isOwner}
                    onMemberRemoved={() => loadTeamData(team.id)}
                    onRoleChanged={() => loadTeamData(team.id)}
                  />

                  {/* Invite Members */}
                  {isOwner && (
                    <InviteMembers
                      teamId={team.id}
                      onInviteSent={() => loadTeamData(team.id)}
                    />
                  )}

                  {/* Pending Invitations */}
                  {isOwner && invitations[team.id] && invitations[team.id].length > 0 && (
                    <PendingInvitations
                      teamId={team.id}
                      invitations={invitations[team.id]}
                      onInvitationCancelled={() => loadTeamData(team.id)}
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function CreateTeamDialog({ onTeamCreated }: { onTeamCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const { execute: createTeam, isPending } = useServerAction(createTeamAction);

  const handleCreate = async () => {
    if (!name || !slug) {
      toast.error("Please enter team name and slug");
      return;
    }

    const [data, err] = await createTeam({
      name,
      slug,
      description,
    });

    if (err) {
      toast.error(err.message);
      return;
    }

    toast.success("Team created successfully!");
    setName("");
    setSlug("");
    setDescription("");
    setOpen(false);
    onTeamCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Team</DialogTitle>
          <DialogDescription>
            Create a new team to collaborate with others
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="team-name-create">Team Name</Label>
            <Input
              id="team-name-create"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // Auto-generate slug from name
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
              }}
              placeholder="My Team"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-slug-create">Team Slug</Label>
            <Input
              id="team-slug-create"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-team"
            />
            <p className="text-xs text-muted-foreground">
              URL-friendly identifier for your team
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-description-create">Description (Optional)</Label>
            <Textarea
              id="team-description-create"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter team description"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamInformation({ team, onUpdate }: { team: Team; onUpdate: () => void }) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const { execute: updateTeam, isPending } = useServerAction(updateTeamAction);

  const handleUpdate = async () => {
    const [data, err] = await updateTeam({
      teamId: team.id,
      name,
      description,
    });

    if (err) {
      toast.error(err.message);
      return;
    }

    toast.success("Team updated successfully");
    onUpdate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Information</CardTitle>
        <CardDescription>Update your team details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="team-name">Team Name</Label>
          <Input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter team name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-description">Description</Label>
          <Textarea
            id="team-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter team description"
            rows={3}
          />
        </div>
        <Button onClick={handleUpdate} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Team
        </Button>
      </CardContent>
    </Card>
  );
}

function TeamMembers({
  teamId,
  members,
  isOwner,
  onMemberRemoved,
  onRoleChanged,
}: {
  teamId: string;
  members: MemberWithUser[];
  isOwner: boolean;
  onMemberRemoved: () => void;
  onRoleChanged: () => void;
}) {
  const { execute: removeMember } = useServerAction(removeTeamMemberAction);
  const { execute: changeRole } = useServerAction(changeMemberRoleAction);

  const handleRemoveMember = async (membershipId: string) => {
    const [data, err] = await removeMember({ teamId, membershipId });
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Member removed successfully");
    onMemberRemoved();
  };

  const handleRoleChange = async (membershipId: string, roleId: string) => {
    const [data, err] = await changeRole({
      teamId,
      membershipId,
      roleId,
      isSystemRole: true,
    });
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Role updated successfully");
    onRoleChanged();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members ({members.length})</CardTitle>
        <CardDescription>Manage team members and their roles</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {members.map((member) => {
            const RoleIcon = roleIcons[member.roleId as keyof typeof roleIcons] || User;
            const isCurrentOwner = member.roleId === SYSTEM_ROLES_ENUM.OWNER;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {member.user.firstName} {member.user.lastName}
                    </p>
                    {isCurrentOwner && <Crown className="h-4 w-4 text-yellow-500" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{member.user.email}</p>
                </div>

                <div className="flex items-center gap-2">
                  {isOwner && !isCurrentOwner ? (
                    <Select
                      value={member.roleId}
                      onValueChange={(value) => handleRoleChange(member.id, value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SYSTEM_ROLES_ENUM.ADMIN}>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Admin
                          </div>
                        </SelectItem>
                        <SelectItem value={SYSTEM_ROLES_ENUM.MEMBER}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Member
                          </div>
                        </SelectItem>
                        <SelectItem value={SYSTEM_ROLES_ENUM.GUEST}>
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Guest
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <RoleIcon className="h-3 w-3" />
                      {roleLabels[member.roleId as keyof typeof roleLabels]}
                    </Badge>
                  )}

                  {isOwner && !isCurrentOwner && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Remove Member</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to remove {member.user.firstName} {member.user.lastName} from the team?
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline">Cancel</Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            Remove
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function InviteMembers({ teamId, onInviteSent }: { teamId: string; onInviteSent: () => void }) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(SYSTEM_ROLES_ENUM.MEMBER);
  const { execute: createInvite, isPending } = useServerAction(createTeamInviteAction);

  const handleInvite = async () => {
    if (!email) {
      toast.error("Please enter an email address");
      return;
    }

    const [data, err] = await createInvite({
      teamId,
      email,
      roleId,
      isSystemRole: true,
    });

    if (err) {
      toast.error(err.message);
      return;
    }

    toast.success(`Invitation sent to ${email}`);
    setEmail("");
    setRoleId(SYSTEM_ROLES_ENUM.MEMBER);
    onInviteSent();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Members</CardTitle>
        <CardDescription>Invite users by email - they'll see the invitation on their Teams page</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email Address</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SYSTEM_ROLES_ENUM.ADMIN}>Admin</SelectItem>
              <SelectItem value={SYSTEM_ROLES_ENUM.MEMBER}>Member</SelectItem>
              <SelectItem value={SYSTEM_ROLES_ENUM.GUEST}>Guest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleInvite} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Send Invitation
        </Button>
      </CardContent>
    </Card>
  );
}

function PendingInvitations({
  teamId,
  invitations,
  onInvitationCancelled,
}: {
  teamId: string;
  invitations: InvitationWithUser[];
  onInvitationCancelled: () => void;
}) {
  const { execute: cancelInvite } = useServerAction(cancelTeamInviteAction);

  const handleCancelInvite = async (inviteId: string) => {
    const [data, err] = await cancelInvite({ inviteId });
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Invitation cancelled");
    onInvitationCancelled();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Invitations ({invitations.length})</CardTitle>
        <CardDescription>Manage pending team invitations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <p className="font-medium">{invite.email}</p>
                <p className="text-sm text-muted-foreground">
                  Invited as {roleLabels[invite.roleId as keyof typeof roleLabels]} by{" "}
                  {invite.invitedByUser.firstName} {invite.invitedByUser.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => handleCancelInvite(invite.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MyPendingInvitations({
  invitations,
  onInvitationAccepted,
  onInvitationDeclined,
}: {
  invitations: MyInvitation[];
  onInvitationAccepted: () => void;
  onInvitationDeclined: () => void;
}) {
  const { execute: acceptInvite, isPending: isAccepting } = useServerAction(acceptTeamInviteByIdAction);
  const { execute: declineInvite, isPending: isDeclining } = useServerAction(declineTeamInviteAction);

  const handleAccept = async (inviteId: string) => {
    const [data, err] = await acceptInvite({ inviteId });
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Invitation accepted! You are now a member of the team.");
    onInvitationAccepted();
  };

  const handleDecline = async (inviteId: string) => {
    const [data, err] = await declineInvite({ inviteId });
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Invitation declined");
    onInvitationDeclined();
  };

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Team Invitations ({invitations.length})
        </CardTitle>
        <CardDescription>You have pending team invitations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-background"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{invite.team.name}</p>
                  <Badge variant="outline" className="flex items-center gap-1">
                    {roleIcons[invite.roleId as keyof typeof roleIcons] &&
                      (() => {
                        const Icon = roleIcons[invite.roleId as keyof typeof roleIcons];
                        return <Icon className="h-3 w-3" />;
                      })()}
                    {roleLabels[invite.roleId as keyof typeof roleLabels]}
                  </Badge>
                </div>
                {invite.team.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {invite.team.description}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  Invited by {invite.invitedByUser.firstName} {invite.invitedByUser.lastName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDecline(invite.id)}
                  disabled={isAccepting || isDeclining}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAccept(invite.id)}
                  disabled={isAccepting || isDeclining}
                >
                  {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OwnerPendingInvitations({
  invitations,
  onInvitationCancelled,
}: {
  invitations: OwnerInvitation[];
  onInvitationCancelled: () => void;
}) {
  const { execute: cancelInvite, isPending: isCancelling } = useServerAction(cancelTeamInviteAction);

  const handleCancel = async (inviteId: string) => {
    const [data, err] = await cancelInvite({ inviteId });
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Invitation cancelled");
    onInvitationCancelled();
  };

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Pending Invitations from Your Teams ({invitations.length})
        </CardTitle>
        <CardDescription>Manage invitations sent from teams you own</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-background"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{invite.team.name}</p>
                  <Badge variant="secondary" className="text-xs">Team</Badge>
                </div>
                <p className="text-sm font-medium mt-1">
                  {invite.email}
                </p>
                <p className="text-sm text-muted-foreground">
                  Invited as {roleLabels[invite.roleId as keyof typeof roleLabels]} by{" "}
                  {invite.invitedByUser.firstName} {invite.invitedByUser.lastName}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancel(invite.id)}
                  disabled={isCancelling}
                >
                  {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancel
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
