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
  const invoiceType = (useWatch({ control, name: "invoiceType" }) ?? "") as string

  useEffect(() => {
    trigger(["wantInvoice", "invoiceType", "nip"])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantInvoice, invoiceType])

  return (
    <div className="grid gap-4">
      {/* Checkbox */}
      <Controller
        name="wantInvoice"
        control={control}
        render={({ field }) => (
          <div className="flex items-center gap-3">
            <input
              id="wantInvoice"
              type="checkbox"
              className="h-4 w-4 accent-black"
              checked={Boolean(field.value)}
              onChange={(e) => {
                field.onChange(e.target.checked)
                trigger(["wantInvoice", "invoiceType", "nip"])
              }}
            />
            <Label htmlFor="wantInvoice" className="cursor-pointer font-normal">
              Chcę otrzymać fakturę
            </Label>
          </div>
        )}
      />

      {wantInvoice && (
        <div className="grid gap-4 rounded-xl border bg-muted/30 px-4 py-4">
          {/* Radio: osoba prywatna / firma */}
          <Controller
            name="invoiceType"
            control={control}
            render={({ field }) => (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Rodzaj faktury</p>
                <div className="flex gap-6">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      value="personal"
                      checked={field.value === "personal"}
                      onChange={() => {
                        field.onChange("personal")
                        trigger(["invoiceType", "nip"])
                      }}
                      className="accent-black"
                    />
                    <span className="text-sm">Osoba prywatna</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      value="company"
                      checked={field.value === "company"}
                      onChange={() => {
                        field.onChange("company")
                        trigger(["invoiceType", "nip"])
                      }}
                      className="accent-black"
                    />
                    <span className="text-sm">Firma</span>
                  </label>
                </div>
                <ErrorSlot message={(errors as any)?.invoiceType?.message} />
              </div>
            )}
          />

          {/* Firma: NIP */}
          {invoiceType === "company" && (
            <div className="grid gap-2">
              <Label htmlFor="nip">
                NIP{" "}
                <span aria-hidden="true" className="font-semibold text-red-600">
                  *
                </span>
              </Label>
              <Controller
                name="nip"
                control={control}
                render={({ field }) => (
                  <Input
                    id="nip"
                    placeholder="1234567890"
                    value={(field.value as string) ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={() => trigger(["invoiceType", "nip"])}
                  />
                )}
              />
              <ErrorSlot message={(errors as any)?.nip?.message} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
