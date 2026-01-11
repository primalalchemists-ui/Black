"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorSlot } from "@/components/forms/ErrorSlot";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

export function CustomerFields<T extends Record<string, any>>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Twoje dane</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="firstName">Imię *</Label>
          <Input id="firstName" {...register("firstName" as any)} autoComplete="given-name" />
          <ErrorSlot message={(errors as any)?.firstName?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="lastName">Nazwisko *</Label>
          <Input id="lastName" {...register("lastName" as any)} autoComplete="family-name" />
          <ErrorSlot message={(errors as any)?.lastName?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="phone">Telefon *</Label>
          <Input id="phone" {...register("phone" as any)} inputMode="tel" autoComplete="tel" />
          <ErrorSlot message={(errors as any)?.phone?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">Email *</Label>
          <Input id="email" {...register("email" as any)} type="email" autoComplete="email" />
          <ErrorSlot message={(errors as any)?.email?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notes">Uwagi (opcjonalnie)</Label>
          <Textarea id="notes" {...register("notes" as any)} rows={4} />
          <ErrorSlot message={(errors as any)?.notes?.message} />
        </div>
      </CardContent>
    </Card>
  );
}
