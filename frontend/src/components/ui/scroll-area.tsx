import * as React from "react";
import { Corner, Root, Scrollbar, Thumb, Viewport } from "@radix-ui/react-scroll-area";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof Root>,
  React.ComponentPropsWithoutRef<typeof Root>
>(({ className = "", children, ...props }, ref) => (
  <Root ref={ref} className={`overflow-hidden ${className}`} {...props}>
    <Viewport className="h-full w-full rounded-[inherit]">{children}</Viewport>
    <Scrollbar
      className="flex select-none touch-none p-0.5 transition-colors duration-150 ease-out bg-transparent hover:bg-muted data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
      orientation="vertical"
    >
      <Thumb className="relative flex-1 rounded-full bg-border before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-11 before:min-h-11" />
    </Scrollbar>
    <Scrollbar
      className="flex select-none touch-none p-0.5 transition-colors duration-150 ease-out bg-transparent hover:bg-muted data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2.5"
      orientation="horizontal"
    >
      <Thumb className="relative flex-1 rounded-full bg-border before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-11 before:min-h-11" />
    </Scrollbar>
    <Corner />
  </Root>
));

ScrollArea.displayName = Root.displayName;

export { ScrollArea };
