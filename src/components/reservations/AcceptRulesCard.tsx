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

  /** nazwa pola w RHF (np. "acceptPrivacyPolicy") */
  name?: string

  label?: string
  /** Endpoint, który zwraca PDF z Content-Disposition: attachment */
  href?: string

  /** do aria/id żeby nie było kolizji */
  idPrefix?: string
}

export function AcceptRulesCard({
  control,
  trigger,
  errors,

  name = "acceptRules",
  label = "Akceptuję regulamin obiektu",
  href = "/regulamin",
  idPrefix = "acceptRules",
}: Props) {
  const labelId = `${idPrefix}-label`
  const descId = `${idPrefix}-desc`
  const errorId = `${idPrefix}-error`
  const checkboxId = idPrefix

  const errMsg = (errors as any)?.[name]?.message

  return (
    <Card>
      <CardContent className="pt-6">
        <Controller
          name={name as any}
          control={control}
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Checkbox
                id={checkboxId}
                checked={Boolean(field.value)}
                aria-labelledby={labelId}
                aria-describedby={`${descId}${errMsg ? ` ${errorId}` : ""}`}
                onCheckedChange={(v) => {
                  field.onChange(Boolean(v))
                  trigger(name as any)
                }}
              />

              <div className="grid gap-1 leading-none">
                <span
                  id={labelId}
                  className="cursor-pointer text-sm font-medium leading-none select-none"
                  onClick={() => {
                    const next = !Boolean(field.value)
                    field.onChange(next)
                    trigger(name as any)
                  }}
                >
                 <span
                  aria-hidden="true"
                  className="font-semibold text-red-600"
                >
                  *
                </span> {label}   
                </span>

                <p id={descId} className="ml-2 text-sm text-muted-foreground">
                  Dokument dostępny na stronie:{" "}
                  <a
                    className="underline hover:text-foreground"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    przeczytaj
                  </a>
                </p>

                <div id={errorId}>
                  <ErrorSlot message={errMsg} />
                </div>
              </div>
            </div>
          )}
        />
      
      </CardContent>
    </Card>
  )
}
