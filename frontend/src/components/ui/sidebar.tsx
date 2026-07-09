import * as React from "react"
import { PanelLeft } from "lucide-react"
import { cn } from "../../lib/utils"

type SidebarContextType = {
  open: boolean
  setOpen: (v: boolean) => void
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextType | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true)
  const toggleSidebar = React.useCallback(() => setOpen((prev) => !prev), [])
  return (
    <SidebarContext.Provider value={{ open, setOpen, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>")
  return ctx
}
