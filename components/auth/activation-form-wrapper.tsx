"use client";

import { activateAccount } from "@/app/actions/auth";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export function ActivationFormWrapper({ token, email }: { token: string; email: string }) {
  return (
    <SetPasswordForm
      mode="activation"
      email={email}
      submitLabel="Activer mon compte"
      onSubmit={(password, confirmPassword) => activateAccount(token, password, confirmPassword)}
    />
  );
}
