"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Global toast provider — mount once in the root layout. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-lg border border-border bg-white shadow-card-md text-sm",
          title: "font-semibold text-text",
          description: "text-muted-foreground",
          actionButton: "bg-navy text-white",
          cancelButton: "bg-muted text-muted-foreground",
          success: "!border-emerald-200",
          error: "!border-red-200",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
