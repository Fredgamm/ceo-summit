import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { emailTemplateOverride: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { resolveEmail } from "./email-template-resolver";
import { EMAIL_TEMPLATES } from "@/lib/email-templates/registry";
import type { EmailTemplateDefinition } from "@/lib/email-templates/types";

const TEST_KEY = "__resolver_test_template__";
const TEST_DEFINITION: EmailTemplateDefinition = {
  key: TEST_KEY,
  category: "ACCOUNT_APPLICATION",
  label: "Test",
  description: "Utilisé uniquement par ce test",
  triggerHint: "n/a",
  variables: [{ key: "name", label: "Nom", example: "Marie" }],
  defaultSubject: "Bonjour {{name}}",
  defaultBlocks: [{ id: "1", type: "paragraph", text: "Bienvenue {{name}}" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Injecte une entrée factice dans le registre partagé pour ce test —
  // évite de dépendre d'une vraie clé qui pourrait être renommée par les
  // agents du Lot 1.
  (EMAIL_TEMPLATES as Record<string, EmailTemplateDefinition>)[TEST_KEY] = TEST_DEFINITION;
});

describe("resolveEmail", () => {
  it("uses the registry default when no override exists", async () => {
    vi.mocked(prisma.emailTemplateOverride.findUnique).mockResolvedValue(null);

    const result = await resolveEmail(TEST_KEY, { name: "Marie" });

    expect(result).not.toBeNull();
    expect(result?.subject).toBe("Bonjour Marie");
  });

  it("returns null when an override exists and is deactivated", async () => {
    vi.mocked(prisma.emailTemplateOverride.findUnique).mockResolvedValue({
      key: TEST_KEY,
      category: "ACCOUNT_APPLICATION",
      subject: null,
      blocks: null,
      isActive: false,
      updatedById: "admin_1",
      updatedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const result = await resolveEmail(TEST_KEY, { name: "Marie" });

    expect(result).toBeNull();
  });

  it("prefers the override's subject/blocks when present", async () => {
    vi.mocked(prisma.emailTemplateOverride.findUnique).mockResolvedValue({
      key: TEST_KEY,
      category: "ACCOUNT_APPLICATION",
      subject: "Objet personnalisé pour {{name}}",
      blocks: [{ id: "1", type: "heading", text: "Salut {{name}}" }],
      isActive: true,
      updatedById: "admin_1",
      updatedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const result = await resolveEmail(TEST_KEY, { name: "Marie" });

    expect(result?.subject).toBe("Objet personnalisé pour Marie");
  });

  it("falls back to default content when the override is active but has no subject/blocks", async () => {
    vi.mocked(prisma.emailTemplateOverride.findUnique).mockResolvedValue({
      key: TEST_KEY,
      category: "ACCOUNT_APPLICATION",
      subject: null,
      blocks: null,
      isActive: true,
      updatedById: "admin_1",
      updatedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const result = await resolveEmail(TEST_KEY, { name: "Marie" });

    expect(result?.subject).toBe("Bonjour Marie");
  });

  it("throws on an unknown key", async () => {
    await expect(resolveEmail("__does_not_exist__", {})).rejects.toThrow();
  });
});
