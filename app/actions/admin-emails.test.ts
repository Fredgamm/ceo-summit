import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    emailTemplateOverride: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<html>preview</html>") }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";
import {
  saveEmailTemplateOverride,
  toggleEmailTemplateActive,
  resetEmailTemplateToDefault,
  previewEmailTemplate,
  sendTestEmailTemplate,
} from "./admin-emails";
import { EMAIL_TEMPLATES } from "@/lib/email-templates/registry";
import type { EmailTemplateDefinition } from "@/lib/email-templates/types";

const ADMIN_SESSION = { user: { id: "admin_1", role: "ADMIN", isPlatformAdmin: true } } as never;

const TEST_KEY = "__admin_emails_test_template__";
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

const VALID_INPUT = {
  subject: "Objet {{name}}",
  blocks: [{ id: "1", type: "paragraph" as const, text: "Corps {{name}}" }],
};

function makeViewer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "admin_1",
    name: "Admin",
    email: "admin@example.mg",
    status: "ACTIVE",
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  (EMAIL_TEMPLATES as Record<string, EmailTemplateDefinition>)[TEST_KEY] = TEST_DEFINITION;
  vi.mocked(auth).mockResolvedValue(ADMIN_SESSION);
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "SUPER_ADMIN" } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(makeViewer());
});

describe("saveEmailTemplateOverride", () => {
  it("rejects a MODERATEUR-only-excluded role... FINANCIER (no emails access)", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "FINANCIER" } as never);

    await expect(saveEmailTemplateOverride(TEST_KEY, VALID_INPUT)).rejects.toThrow();
  });

  it("is allowed for MODERATEUR (communications-adjacent)", async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({ role: "MODERATEUR" } as never);

    const result = await saveEmailTemplateOverride(TEST_KEY, VALID_INPUT);

    expect(result.success).toBe(true);
  });

  it("upserts the override and writes an audit log entry", async () => {
    const result = await saveEmailTemplateOverride(TEST_KEY, VALID_INPUT);

    expect(result.success).toBe(true);
    expect(prisma.emailTemplateOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: TEST_KEY } })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "email-template.update" }),
      })
    );
  });

  it("rejects invalid input (empty subject)", async () => {
    const result = await saveEmailTemplateOverride(TEST_KEY, { ...VALID_INPUT, subject: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a block referencing a variable not declared for this template", async () => {
    const result = await saveEmailTemplateOverride(TEST_KEY, {
      subject: "Objet {{unknownVar}}",
      blocks: VALID_INPUT.blocks,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("unknownVar");
  });

  it("throws on an unknown template key", async () => {
    await expect(saveEmailTemplateOverride("__does_not_exist__", VALID_INPUT)).rejects.toThrow();
  });
});

describe("toggleEmailTemplateActive", () => {
  it("upserts isActive and writes the matching audit action", async () => {
    const result = await toggleEmailTemplateActive(TEST_KEY, false);

    expect(result.success).toBe(true);
    expect(prisma.emailTemplateOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: TEST_KEY } })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "email-template.deactivate" }),
      })
    );
  });
});

describe("resetEmailTemplateToDefault", () => {
  it("deletes the override row and writes an audit log entry", async () => {
    const result = await resetEmailTemplateToDefault(TEST_KEY);

    expect(result.success).toBe(true);
    expect(prisma.emailTemplateOverride.deleteMany).toHaveBeenCalledWith({
      where: { key: TEST_KEY },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "email-template.reset" }) })
    );
  });
});

describe("previewEmailTemplate", () => {
  it("renders HTML using the template's example variable values, without writing anything", async () => {
    const result = await previewEmailTemplate(TEST_KEY, VALID_INPUT);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.html).toContain("preview");
    expect(prisma.emailTemplateOverride.upsert).not.toHaveBeenCalled();
  });
});

describe("sendTestEmailTemplate", () => {
  it("sends to the connected admin's own email with a [TEST] prefix", async () => {
    const result = await sendTestEmailTemplate(TEST_KEY, VALID_INPUT);

    expect(result.success).toBe(true);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.mg",
        subject: expect.stringContaining("[TEST]"),
      })
    );
  });

  it("fails when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await sendTestEmailTemplate(TEST_KEY, VALID_INPUT);

    expect(result.success).toBe(false);
  });
});
