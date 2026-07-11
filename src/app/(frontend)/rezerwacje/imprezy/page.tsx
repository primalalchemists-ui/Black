export const dynamic = "force-dynamic";
export const revalidate = 0;

import ImprezaClient from "./Client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const params = await searchParams;
  return <ImprezaClient initialEventId={params.eventId} />;
}
