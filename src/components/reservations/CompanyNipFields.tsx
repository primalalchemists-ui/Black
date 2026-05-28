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

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ErrorSlot } from "@/components/forms/ErrorSlot"

type Props<T extends FieldValues> = {
  control: Control<T>
  trigger: UseFormTrigger<T>
  errors: FieldErrors<T>
  companyLabel?: string
}

export function CompanyNipFields<T extends FieldValues>({
  control,
  trigger,
  errors,
  companyLabel = "Jestem firmą",
}: Props<T>) {
  const isCompany = Boolean(useWatch({ control, name: "isCompany" as any }))

  useEffect(() => {
    if (isCompany) trigger("nip" as any)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompany])

  const labelId = "isCompany-label"
  const descId = "isCompany-desc"
  const nipErrorId = "nip-error"

  return (
    <div className="grid gap-4">
      <Controller
        name={"isCompany" as any}
        control={control}
        render={({ field }) => (
          <div className="flex items-start gap-3">
            <Checkbox
              id="isCompany"
              checked={Boolean(field.value)}
              aria-labelledby={labelId}
              aria-describedby={descId}
              onCheckedChange={(v) => {
                field.onChange(Boolean(v))
                trigger("nip" as any)
              }}
            />

            <div className="grid gap-1 leading-none">
              {/* Label jako tekst (semantyka przez aria-labelledby) */}
              <span
                id={labelId}
                className="cursor-pointer text-sm font-medium leading-none select-none"
                onClick={() => {
                  const next = !Boolean(field.value)
                  field.onChange(next)
                  trigger("nip" as any)
                }}
              >
                {companyLabel}
              </span>

              <p id={descId} className="text-sm text-muted-foreground">
                Jeśli zaznaczysz, podaj NIP.
              </p>
            </div>
          </div>
        )}
      />

      {isCompany ? (
        <div className="grid gap-2">
          <Label htmlFor="nip">NIP</Label>
          <Controller
            name={"nip" as any}
            control={control}
            render={({ field }) => (
              <Input
                id="nip"
                placeholder="1234567890"
                value={(field.value as string) ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value)
                  trigger("nip" as any)
                }}
                onBlur={() => trigger("nip" as any)}
                inputMode="numeric"
                aria-describedby={(errors as any)?.nip?.message ? nipErrorId : undefined}
                aria-invalid={Boolean((errors as any)?.nip?.message) || undefined}
              />
            )}
          />
          <div id={nipErrorId}>
            <ErrorSlot message={(errors as any)?.nip?.message} />
          </div>
        </div>
      ) : (
        <div className="min-h-[58px]" />
      )}
    </div>
  )
}
