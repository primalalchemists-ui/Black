"use client"

import { useEffect } from "react"
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormTrigger,
} from "react-hook-form"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ErrorSlot } from "@/components/forms/ErrorSlot"

type Props = {
  control: Control<FieldValues>
  trigger: UseFormTrigger<FieldValues>
  errors: FieldErrors<FieldValues>
}

export function InvoiceFields({ control, trigger, errors }: Props) {
  const wantInvoice = Boolean(useWatch({ control, name: "wantInvoice" }))

  useEffect(() => {
    if (wantInvoice) trigger(["wantInvoice", "nip"])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantInvoice])

  return (
    <div className="grid gap-4">
      <Controller
        name="wantInvoice"
        control={control}
        render={({ field }) => (
          <div className="flex items-start gap-3">
            {/* Natywny checkbox = wzorcowe zachowanie klawiatury (Space) */}
            <input
              id="wantInvoice"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-black"
              checked={Boolean(field.value)}
              onChange={(e) => {
                field.onChange(e.target.checked)
                trigger(["wantInvoice", "nip"])
              }}
            />

            <div className="grid gap-1 leading-none">
              <Label htmlFor="wantInvoice">Chcę fakturę</Label>
              <p className="text-sm text-muted-foreground">Jeśli zaznaczysz, podaj NIP.</p>
            </div>
          </div>
        )}
      />

      <div className="grid gap-2">
        <Label htmlFor="nip">NIP</Label>

        <Controller
          name="nip"
          control={control}
          render={({ field }) => (
            <Input
              id="nip"
              placeholder="1234567890"
              value={(field.value as string) ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={() => trigger(["wantInvoice", "nip"])}
              disabled={!wantInvoice}
            />
          )}
        />

        <ErrorSlot message={(errors as any)?.nip?.message} />
      </div>
    </div>
  )
}
