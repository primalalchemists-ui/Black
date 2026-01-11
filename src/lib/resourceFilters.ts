// src/lib/resourceFilters.ts

export type Service = "bowling" | "billiard";
export type ReservationType = "stolik" | "kregle" | "bilard" | "biznes";
export type ResourceType = "lane" | "billiard";

export const expectedResourceTypeByService: Record<Service, ResourceType> = {
  bowling: "lane",
  billiard: "billiard",
};

export const expectedResourceTypeByReservationType: Partial<Record<ReservationType, ResourceType>> = {
  kregle: "lane",
  bilard: "billiard",
};

// ✅ odporny extractor ID (Payload potrafi wysłać różne shape'y relationship)
export function extractRelationshipIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const item of value) {
    if (!item) continue;

    if (typeof item === "string" || typeof item === "number") {
      out.push(String(item));
      continue;
    }

    if (typeof item === "object") {
      const anyItem = item as any;

      if (anyItem.id != null) {
        out.push(String(anyItem.id));
        continue;
      }

      if (anyItem._id != null) {
        out.push(String(anyItem._id));
        continue;
      }

      if (anyItem.value != null) {
        const v = anyItem.value;

        if (typeof v === "string" || typeof v === "number") {
          out.push(String(v));
          continue;
        }

        if (typeof v === "object" && v) {
          if ((v as any).id != null) out.push(String((v as any).id));
          else if ((v as any)._id != null) out.push(String((v as any)._id));
          continue;
        }
      }
    }
  }

  return out.filter(Boolean);
}
