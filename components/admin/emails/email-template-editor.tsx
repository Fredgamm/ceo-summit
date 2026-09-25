"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import {
  saveEmailTemplateOverride,
  sendTestEmailTemplate,
  resetEmailTemplateToDefault,
  previewEmailTemplate,
} from "@/app/actions/admin-emails";
import type { EmailBlock, EmailBlockType } from "@/lib/email-blocks";
import type { EmailVariableDef } from "@/lib/email-templates/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  BlockEditorCard,
  type FocusableFieldRef,
} from "@/components/admin/emails/block-editor-card";

interface EmailTemplateEditorProps {
  templateKey: string;
  variables: EmailVariableDef[];
  initialSubject: string;
  initialBlocks: EmailBlock[];
  hasOverride: boolean;
  isActive: boolean;
}

function newBlockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `block_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function createEmptyBlock(type: EmailBlockType): EmailBlock {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return { id, type, text: "" };
    case "paragraph":
      return { id, type, text: "" };
    case "button":
      return { id, type, label: "", url: "" };
    case "divider":
      return { id, type };
    case "list":
      return { id, type, style: "bullet", items: [""] };
  }
}

const ADD_BLOCK_OPTIONS: { type: EmailBlockType; label: string }[] = [
  { type: "heading", label: "Titre" },
  { type: "paragraph", label: "Paragraphe" },
  { type: "button", label: "Bouton" },
  { type: "list", label: "Liste" },
  { type: "divider", label: "Séparateur" },
];

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — éditeur par blocs, panneau de variables, aperçu live, enregistrer
 * / tester / réinitialiser. Jamais de HTML brut : voir lib/email-blocks.ts.
 */
export function EmailTemplateEditor({
  templateKey,
  variables,
  initialSubject,
  initialBlocks,
  hasOverride,
  isActive,
}: EmailTemplateEditorProps) {
  const router = useRouter();
  const [subject, setSubject] = React.useState(initialSubject);
  const [blocks, setBlocks] = React.useState<EmailBlock[]>(initialBlocks);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [sendingTest, setSendingTest] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  const lastFocusedRef = React.useRef<{
    ref: FocusableFieldRef;
    el: HTMLInputElement | HTMLTextAreaElement;
  } | null>(null);

  // Aperçu live, débounced — appelle previewEmailTemplate (substitue les
  // valeurs d'exemple du registre, aucune écriture en base).
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      const result = await previewEmailTemplate(templateKey, { subject, blocks });
      if (result.success) {
        setPreviewHtml(result.data.html);
        setPreviewError(null);
      } else {
        setPreviewError(result.error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [templateKey, subject, blocks]);

  function updateBlock(index: number, next: EmailBlock) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setBlocks((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addBlock(type: EmailBlockType) {
    setBlocks((prev) => [...prev, createEmptyBlock(type)]);
  }

  function insertVariable(key: string) {
    const focused = lastFocusedRef.current;
    if (!focused) {
      // Aucun champ n'a le focus : on insère dans l'objet par défaut.
      setSubject((s) => `${s}{{${key}}}`);
      return;
    }
    const { ref, el } = focused;
    const { selectionStart, selectionEnd, value } = el;
    const start = selectionStart ?? value.length;
    const end = selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}{{${key}}}${value.slice(end)}`;
    const caret = start + key.length + 4;

    if (ref.field === "subject") {
      setSubject(next);
    } else {
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== ref.blockId) return b;
          if (ref.field === "items" && b.type === "list" && ref.itemIndex !== undefined) {
            const items = [...b.items];
            items[ref.itemIndex] = next;
            return { ...b, items };
          }
          return { ...b, [ref.field]: next } as EmailBlock;
        })
      );
    }
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveEmailTemplateOverride(templateKey, { subject, blocks });
      if (result.success) {
        toast.success("Email enregistré.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    try {
      const result = await sendTestEmailTemplate(templateKey, { subject, blocks });
      if (result.success) {
        toast.success("Email de test envoyé à ton adresse.");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSendingTest(false);
    }
  }

  async function handleReset() {
    const result = await resetEmailTemplateToDefault(templateKey);
    if (result.success) {
      toast.success("Réinitialisé au modèle par défaut.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge variant={hasOverride ? "executive" : "draft"}>
            {hasOverride ? "Personnalisé" : "Modèle par défaut"}
          </Badge>
          <Badge variant={isActive ? "active" : "suspended"}>
            {isActive ? "Actif" : "Désactivé"}
          </Badge>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-border bg-white p-4">
          <Label className="text-xs text-text-muted">Objet</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={(e) =>
              (lastFocusedRef.current = { ref: { blockId: "", field: "subject" }, el: e.target })
            }
          />
        </div>

        <div className="flex flex-col gap-3">
          {blocks.map((block, index) => (
            <BlockEditorCard
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              onChange={(next) => updateBlock(index, next)}
              onRemove={() => removeBlock(index)}
              onMoveUp={() => moveBlock(index, -1)}
              onMoveDown={() => moveBlock(index, 1)}
              onFieldFocus={(ref, el) => (lastFocusedRef.current = { ref, el })}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {ADD_BLOCK_OPTIONS.map((opt) => (
            <Button
              key={opt.type}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addBlock(opt.type)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> {opt.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button variant="outline" onClick={handleSendTest} disabled={sendingTest}>
            {sendingTest ? "Envoi…" : "Envoyer un test"}
          </Button>
          {hasOverride && (
            <Button variant="ghost" onClick={() => setResetOpen(true)}>
              Réinitialiser au modèle par défaut
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Variables disponibles
          </h3>
          <div className="flex flex-col gap-1.5">
            {variables.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                className="rounded border border-border px-2 py-1.5 text-left text-xs hover:bg-surface"
              >
                <span className="font-mono text-navy">{`{{${v.key}}}`}</span>
                <span className="ml-1.5 text-text-muted">— {v.label}</span>
              </button>
            ))}
            {variables.length === 0 && (
              <p className="text-xs text-text-muted">Aucune variable pour cet email.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Aperçu
          </h3>
          {previewError && <p className="text-xs text-destructive">{previewError}</p>}
          {previewHtml && (
            <iframe
              title="Aperçu de l'email"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[600px] w-full rounded border border-border"
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Réinitialiser au modèle par défaut"
        description="La personnalisation actuelle sera supprimée — l'email repassera au contenu par défaut."
        confirmLabel="Réinitialiser"
        variant="destructive"
        onConfirm={handleReset}
      />
    </div>
  );
}
