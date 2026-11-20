"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;

interface SheetContentProps {
  open: boolean;
  title: string;
  children: ReactNode;
}

// Adapted from shadcn/ui Sheet with a Motion transition for the panel.
export function SheetContent({ open, title, children }: SheetContentProps) {
  return (
    <AnimatePresence>
      {open ? (
        <Dialog.Portal forceMount>
          <Dialog.Overlay asChild forceMount>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/30"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
          </Dialog.Overlay>
          <Dialog.Content asChild forceMount aria-describedby={undefined}>
            <motion.div
              className="fixed inset-y-0 right-0 z-50 w-76 max-w-[calc(100%_-_1.5rem)] overflow-y-auto border-l border-divider bg-header p-4 shadow-xl"
              initial={{ x: "100%", opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 450, damping: 42 }}
            >
              <div className="mb-3 flex items-center justify-between border-b border-divider pb-2">
                <Dialog.Title className="text-sm font-bold">{title}</Dialog.Title>
                <Dialog.Close className="grid size-11 place-items-center rounded-lg text-muted hover:bg-selected" aria-label="Đóng menu">
                  <X size={18} aria-hidden="true" />
                </Dialog.Close>
              </div>
              {children}
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      ) : null}
    </AnimatePresence>
  );
}
