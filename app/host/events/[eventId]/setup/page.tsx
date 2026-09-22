import { redirect } from "next/navigation";

export default async function Page({ params }: PageProps<"/host/events/[eventId]/setup">) {
  const { eventId } = await params;
  redirect(`/host/events/${eventId}/setup/general`);
}
