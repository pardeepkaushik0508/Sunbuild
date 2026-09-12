import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireSession } from "@/lib/session";

export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Profile"
        description="Update your display name and profile photo"
        icon={<UserRound size={18} />}
      />
      <ProfileForm user={session.user} />
    </div>
  );
}
