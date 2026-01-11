import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ReservationRules({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">{children}</AlertDescription>
    </Alert>
  );
}
