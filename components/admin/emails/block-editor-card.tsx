"use client";

import { GripVertical, Trash2, ChevronUp, ChevronDown, Plus, X } from "lucide-react";

import type { EmailBlock } from "@/lib/email-blocks";
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

const BLOCK_TYPE_LABELS: Record<EmailBlock["type"], string> = {
  heading: "Titre",
  paragraph: "Paragraphe",
  button: "Bouton",
  divider: "Séparateur",
  list: "Liste",
};

/** Indice du champ texte pour l'insertion de variable au curseur — voir
 * EmailTemplateEditor::insertVariable. */
export type FocusableFieldRef = { blockId: string; field: string; itemIndex?: number };

interface BlockEditorCardProps {
  block: EmailBlock;
  index: number;
  total: number;
  onChange: (block: EmailBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFieldFocus: (ref: FocusableFieldRef, el: HTMLInputElement | HTMLTextAreaElement) => void;
}

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — un petit formulaire par type de bloc. Réordonnancement par
 * boutons ▲/▼ plutôt qu'une lib de drag-and-drop (aucune n'est présente
 * dans le projet, pas justifié pour réordonner ~5 blocs).
 */
export function BlockEditorCard({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFieldFocus,
}: BlockEditorCardProps) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <GripVertical className="h-4 w-4 text-border" />
          {BLOCK_TYPE_LABELS[block.type]}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={onMoveUp}
            aria-label="Monter"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={onMoveDown}
            aria-label="Descendre"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Supprimer">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {(block.type === "heading" || block.type === "paragraph") && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-text-muted">
            Texte {block.type === "paragraph" && "— **gras**, _italique_, [texte](url)"}
          </Label>
          {block.type === "heading" ? (
            <Input
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onFocus={(e) => onFieldFocus({ blockId: block.id, field: "text" }, e.target)}
            />
          ) : (
            <Textarea
              rows={3}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onFocus={(e) => onFieldFocus({ blockId: block.id, field: "text" }, e.target)}
            />
          )}
        </div>
      )}

      {block.type === "button" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-text-muted">Libellé</Label>
            <Input
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              onFocus={(e) => onFieldFocus({ blockId: block.id, field: "label" }, e.target)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-text-muted">URL</Label>
            <Input
              value={block.url}
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              onFocus={(e) => onFieldFocus({ blockId: block.id, field: "url" }, e.target)}
            />
          </div>
        </div>
      )}

      {block.type === "list" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-text-muted">Style</Label>
            <Select
              value={block.style}
              onValueChange={(v: "bullet" | "number") => onChange({ ...block, style: v })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bullet">À puces</SelectItem>
                <SelectItem value="number">Numérotée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            {block.items.map((item, itemIndex) => (
              <div key={itemIndex} className="flex items-start gap-2">
                <Textarea
                  rows={2}
                  value={item}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[itemIndex] = e.target.value;
                    onChange({ ...block, items });
                  }}
                  onFocus={(e) =>
                    onFieldFocus({ blockId: block.id, field: "items", itemIndex }, e.target)
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={block.items.length <= 1}
                  onClick={() =>
                    onChange({ ...block, items: block.items.filter((_, i) => i !== itemIndex) })
                  }
                  aria-label="Retirer cet élément"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => onChange({ ...block, items: [...block.items, ""] })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter un élément
            </Button>
          </div>
        </div>
      )}

      {block.type === "divider" && (
        <p className="text-xs text-text-muted">Ligne de séparation — aucun réglage.</p>
      )}
    </div>
  );
}
