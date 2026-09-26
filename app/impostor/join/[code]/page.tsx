import { redirect } from "next/navigation";

type LegacyImpostorJoinPageProps = {
  params: Promise<{ code: string }>;
};

export default async function LegacyImpostorJoinPage({ params }: LegacyImpostorJoinPageProps) {
  const { code } = await params;
  redirect(`/grupo/invitacion/${encodeURIComponent(code)}`);
}
