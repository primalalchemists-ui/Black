"use client"

import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormTrigger,
} from "react-hook-form"

import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorSlot } from "@/components/forms/ErrorSlot"

type Props = {
  control: Control<FieldValues>
  trigger: UseFormTrigger<FieldValues>
  errors: FieldErrors<FieldValues>
  label?: string
  /** Endpoint, który zwraca PDF z Content-Disposition: attachment */
  href?: string
}

export function AcceptRulesCard({
  control,
  trigger,
  errors,
  label = "Akceptuję regulamin obiektu",
  href = "/api/regulamin",
}: Props) {
  const labelId = "acceptRules-label"
  const descId = "acceptRules-desc"
  const errorId = "acceptRules-error"

  return (
    <Card>
      <CardContent className="pt-6">
        <Controller
          name="acceptRules"
          control={control}
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Checkbox
                id="acceptRules"
                checked={Boolean(field.value)}
                aria-labelledby={labelId}
                aria-describedby={`${descId}${
                  (errors as any)?.acceptRules?.message ? ` ${errorId}` : ""
                }`}
                onCheckedChange={(v) => {
                  field.onChange(Boolean(v))
                  trigger("acceptRules")
                }}
              />

              <div className="grid gap-1 leading-none">
                <span
                  id={labelId}
                  className="text-sm font-medium leading-none"
                  onClick={() => {
                    const next = !Boolean(field.value)
                    field.onChange(next)
                    trigger("acceptRules")
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      const next = !Boolean(field.value)
                      field.onChange(next)
                      trigger("acceptRules")
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {label}
                </span>

                <p id={descId} className="text-sm text-muted-foreground">
                  Regulamin do pobrania:{" "}
                  <a
                    className="underline"
                    href={href}
                    // server wymusza attachment, ale zostawiamy też atrybut download jako bonus
                    download
                    rel="noopener noreferrer"
                  >
                    pobierz PDF
                  </a>
                </p>

                <div id={errorId}>
                  <ErrorSlot message={(errors as any)?.acceptRules?.message} />
                </div>
              </div>
            </div>
          )}
        />
      </CardContent>
    </Card>
  )
}
