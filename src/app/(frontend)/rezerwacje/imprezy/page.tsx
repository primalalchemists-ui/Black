export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getPayload } from "payload";
import config from "@payload-config";
import ImprezaClient from "./Client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const params = await searchParams;
  const payload = await getPayload({ config });
  const settings = await payload.findGlobal({ slug: "site-settings", overrideAccess: true });
  const phone = (settings as any)?.phone as string | undefined;
  return <ImprezaClient initialEventId={params.eventId} phone={phone} />;
}
