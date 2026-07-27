import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-navy text-white",
        secondary: "border-transparent bg-muted text-muted-foreground",
        outline: "text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        // Status badges (matches wireframe .st-* classes)
        pending: "border-transparent bg-amber-100 text-amber-800",
        approved: "border-transparent bg-emerald-100 text-emerald-800",
        refused: "border-transparent bg-red-100 text-red-800",
        active: "border-transparent bg-emerald-100 text-emerald-800",
        suspended: "border-transparent bg-red-100 text-red-800",
        draft: "border-transparent bg-slate-100 text-slate-700",
        // Tier badges
        member: "border-transparent bg-slate-100 text-slate-700",
        executive: "border-transparent bg-gold-pale text-amber-800",
        chairman: "border-transparent bg-navy-dark text-gold",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
