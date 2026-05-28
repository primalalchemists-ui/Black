"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorSlot } from "@/components/forms/ErrorSlot";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

function RequiredStar() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 font-semibold text-red-600"
    >
      *
    </span>
  );
}

function fieldError(errors: any, name: string) {
  return errors?.[name]?.message;
}

export function CustomerFields<T extends Record<string, any>>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}) {
  const firstNameError = fieldError(errors as any, "firstName");
  const lastNameError = fieldError(errors as any, "lastName");
  const phoneError = fieldError(errors as any, "phone");
  const emailError = fieldError(errors as any, "email");
  const notesError = fieldError(errors as any, "notes");

  const inputBase =
    "transition-colors focus-visible:ring-0"; // ring off, bo chcesz ramkę
  const errorClass =
    "border-red-600 focus-visible:border-red-600"; // ramka w tym samym kolorze

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dane kontaktowe</CardTitle>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="firstName" className="flex items-center">
           <RequiredStar /> <span className="ml-1">Imię </span>
          </Label>

          <Input
            id="firstName"
            autoComplete="given-name"
            className={[inputBase, firstNameError ? errorClass : ""].join(" ")}
            aria-invalid={!!firstNameError}
            aria-describedby={firstNameError ? "firstName-error" : undefined}
            {...register("firstName" as any)}
          />

          <div id="firstName-error">
            <ErrorSlot message={firstNameError} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="lastName" className="flex items-center">
            <RequiredStar /> <span className="ml-1">Nazwisko</span>
          </Label>

          <Input
            id="lastName"
            autoComplete="family-name"
            className={[inputBase, lastNameError ? errorClass : ""].join(" ")}
            aria-invalid={!!lastNameError}
            aria-describedby={lastNameError ? "lastName-error" : undefined}
            {...register("lastName" as any)}
          />

          <div id="lastName-error">
            <ErrorSlot message={lastNameError} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="phone" className="flex items-center">
            <RequiredStar /> <span className="ml-1">Telefon</span>
          </Label>

          <Input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            className={[inputBase, phoneError ? errorClass : ""].join(" ")}
            aria-invalid={!!phoneError}
            aria-describedby={phoneError ? "phone-error" : undefined}
            {...register("phone" as any)}
          />

          <div id="phone-error">
            <ErrorSlot message={phoneError} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email" className="flex items-center">
            <RequiredStar /> <span className="ml-1">Email</span>
          </Label>

          <Input
            id="email"
            type="email"
            autoComplete="email"
            className={[inputBase, emailError ? errorClass : ""].join(" ")}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? "email-error" : undefined}
            {...register("email" as any)}
          />

          <div id="email-error">
            <ErrorSlot message={emailError} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notes">Uwagi (opcjonalnie)</Label>

          <Textarea
            id="notes"
            rows={4}
            className={[inputBase, notesError ? errorClass : ""].join(" ")}
            aria-invalid={!!notesError}
            aria-describedby={notesError ? "notes-error" : undefined}
            {...register("notes" as any)}
          />

          <div id="notes-error">
            <ErrorSlot message={notesError} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
