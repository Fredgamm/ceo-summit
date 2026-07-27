"use client";

import { resetPassword } from "@/app/actions/auth";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export function ResetPasswordFormWrapper({ token }: { token: string }) {
  return (
    <SetPasswordForm
      mode="reset"
      submitLabel="Réinitialiser mon mot de passe"
      onSubmit={(password, confirmPassword) => resetPassword(token, password, confirmPassword)}
    />
  );
}
