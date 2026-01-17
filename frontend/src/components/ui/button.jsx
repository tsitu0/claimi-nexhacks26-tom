import React from "react";

import { cn } from "@/lib/utils";

const Button = React.forwardRef(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    const variants = {
      default:
        "bg-[#2563EB] text-white hover:bg-[#1E40AF] shadow-sm shadow-black/20",
      outline:
        "border border-white/15 text-white/90 hover:border-white/30 hover:text-white",
      ghost: "text-white/80 hover:text-white hover:bg-white/5",
    };
    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-5 text-sm",
      lg: "h-12 px-6 text-base",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
