"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function AdminDashboard() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/collections/reservations")
  }, [router])
  return null
}
