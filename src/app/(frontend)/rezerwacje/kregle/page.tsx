export const dynamic = "force-dynamic";
export const revalidate = 0;

import Client from "./Client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const params = await searchParams
  const date = typeof params.date === "string" ? params.date : undefined
  return <Client initialDate={date} />;
}
