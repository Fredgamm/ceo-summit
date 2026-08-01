"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createCompany, updateCompany } from "@/app/actions/company";
import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CompanyFormValues {
  name: string;
  sector: string;
  country: string;
  description: string;
  website: string;
}

const EMPTY_VALUES: CompanyFormValues = {
  name: "",
  sector: "",
  country: "",
  description: "",
  website: "",
};

interface CompanyFormProps {
  mode: "create" | "edit";
  companyId?: string;
  initialValues?: Partial<CompanyFormValues>;
}

/** Phase 2 offres/paiement — création/édition de la fiche entreprise. */
export function CompanyForm({ mode, companyId, initialValues }: CompanyFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<CompanyFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "create" ? await createCompany(values) : await updateCompany(companyId!, values);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const destination =
        mode === "create" && "data" in result && result.data
          ? `/entreprises/${result.data.id}`
          : `/entreprises/${companyId}`;
      router.push(destination);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[560px] rounded-lg border border-border bg-white p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-name">Nom de l&apos;entreprise *</Label>
          <Input
            id="company-name"
            placeholder="ex. Rakoto Holding"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Secteur *</Label>
            <Select value={values.sector} onValueChange={(v) => set("sector", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Pays *</Label>
            <Select value={values.country} onValueChange={(v) => set("country", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner…" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-website">Site web</Label>
          <Input
            id="company-website"
            placeholder="https://..."
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-desc">Description</Label>
          <Textarea
            id="company-desc"
            rows={4}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={1000}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSubmit} disabled={submitting} className="justify-center">
          {submitting
            ? "Enregistrement…"
            : mode === "create"
              ? "✓ Créer l'entreprise"
              : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
