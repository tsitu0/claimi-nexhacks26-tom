import React from "react";

import { cn } from "@/lib/utils";

const Separator = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("h-px w-full bg-white/10", className)}
    {...props}
  />
));
Separator.displayName = "Separator";

export { Separator };
