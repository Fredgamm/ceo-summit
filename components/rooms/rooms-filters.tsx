"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RoomAccessLevel } from "@prisma/client";

import { SECTORS } from "@/lib/sectors";
import { ROOM_ACCESS_LABEL } from "@/lib/rooms-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

const ACCESS_LEVELS = Object.entries(ROOM_ACCESS_LABEL) as [RoomAccessLevel, string][];

/** E4-T02 — filtres secteur/accès minimum. */
export function RoomsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <Select
        value={searchParams.get("secteur") || ALL}
        onValueChange={(v) => updateParam("secteur", v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Tous les secteurs" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les secteurs</SelectItem>
          {SECTORS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("acces") || ALL}
        onValueChange={(v) => updateParam("acces", v)}
      >
        <SelectTrigger className="w-[190px]">
          <SelectValue placeholder="Tous les accès" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous les accès</SelectItem>
          {ACCESS_LEVELS.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
