import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("@react-email/render", () => ({ render: vi.fn().mockResolvedValue("<p>hello</p>") }));

const ENV_KEYS = [
  "NODE_ENV",
  "MAIL_DEV_MODE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
] as const;
const savedEnv: Record<string, string | undefined> = {};

/** Réimporte le module à chaque test : les transports sont mis en cache au niveau module. */
async function loadModule() {
  vi.resetModules();
  return import("./resend");
}

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
}

const REAL_SMTP = {
  SMTP_HOST: "mail.ceo-summit.mg",
  SMTP_PORT: "465",
  SMTP_USER: "contact@ceo-summit.mg",
  SMTP_PASSWORD: "secret",
};

const message = { to: "jean@example.mg", subject: "Bienvenue", react: null as never };

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  vi.clearAllMocks();
  sendMail.mockResolvedValue({ messageId: "smtp-123" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  setEnv(savedEnv as never);
  vi.restoreAllMocks();
});

describe("sendTransactionalEmail — production", () => {
  it("throws a typed error and logs explicitly when SMTP isn't configured, never falling back to Maildev", async () => {
    setEnv({ NODE_ENV: "production" });
    const { sendTransactionalEmail, EmailNotConfiguredError } = await loadModule();

    await expect(sendTransactionalEmail(message)).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(sendMail).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[email] SMTP non configuré — email non envoyé à jean@example.mg",
      expect.anything()
    );
  });

  it("treats the placeholder host as not configured", async () => {
    setEnv({ NODE_ENV: "production", ...REAL_SMTP, SMTP_HOST: "smtp.exemple.mg" });
    const { sendTransactionalEmail, EmailNotConfiguredError } = await loadModule();
    await expect(sendTransactionalEmail(message)).rejects.toBeInstanceOf(EmailNotConfiguredError);
  });

  it("sends through the real SMTP server when configured", async () => {
    setEnv({ NODE_ENV: "production", ...REAL_SMTP, EMAIL_FROM: "noreply@ceo-summit.mg" });
    const { sendTransactionalEmail } = await loadModule();

    await expect(sendTransactionalEmail(message)).resolves.toEqual({ id: "smtp-123" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "mail.ceo-summit.mg", port: 465, secure: true })
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@ceo-summit.mg", to: "jean@example.mg" })
    );
  });

  it("still honours an explicit MAIL_DEV_MODE=true", async () => {
    setEnv({ NODE_ENV: "production", MAIL_DEV_MODE: "true" });
    const { sendTransactionalEmail } = await loadModule();
    await expect(sendTransactionalEmail(message)).resolves.toEqual({ id: "maildev-local" });
  });
});

describe("sendTransactionalEmail — development", () => {
  it("falls back to Maildev when SMTP isn't configured", async () => {
    setEnv({ NODE_ENV: "development" });
    const { sendTransactionalEmail } = await loadModule();

    await expect(sendTransactionalEmail(message)).resolves.toEqual({ id: "maildev-local" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "localhost", port: 1025 })
    );
  });
});

describe("sender address", () => {
  it("uses EMAIL_FROM first", async () => {
    setEnv({ ...REAL_SMTP, EMAIL_FROM: "events@ceo-summit.mg" });
    const { getDefaultFromAddress } = await loadModule();
    expect(getDefaultFromAddress()).toBe("events@ceo-summit.mg");
  });

  it("falls back to the SMTP account when EMAIL_FROM is empty", async () => {
    setEnv({ ...REAL_SMTP });
    const { getDefaultFromAddress } = await loadModule();
    expect(getDefaultFromAddress()).toBe("contact@ceo-summit.mg");
  });

  it("falls back to noreply@ceo-summit.mg when neither is set", async () => {
    setEnv({});
    const { getDefaultFromAddress } = await loadModule();
    expect(getDefaultFromAddress()).toBe("noreply@ceo-summit.mg");
  });
});
