import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn(), useSearchParams: vi.fn() }));
vi.mock("@/components/auth/resend-activation-form", () => ({ ResendActivationForm: () => null }));

import { sanitizeCallbackUrl } from "./login-form";

describe("sanitizeCallbackUrl", () => {
  it.each(["/dashboard", "/evenements/abc?tab=1", "/messagerie#bas"])(
    "keeps a simple relative path (%s)",
    (url) => {
      expect(sanitizeCallbackUrl(url)).toBe(url);
    }
  );

  // 25 septembre 2026 (audit MVP) — `/\` passait le contrôle d'origine.
  it.each([
    null,
    "",
    "dashboard",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
  ])("falls back to /dashboard for %j", (url) => {
    expect(sanitizeCallbackUrl(url)).toBe("/dashboard");
  });
});
