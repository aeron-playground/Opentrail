import { XIcon } from "@phosphor-icons/react/X";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "./button";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  // The id of the sheet's heading, which names the dialog for screen readers.
  labelledBy: string;
  children: ReactNode;
};

// A modal sheet: along the bottom edge on phones, centred from 640 px. The native <dialog>
// keeps focus inside, closes on Escape and makes the page behind it inert.
export function Sheet({ open, onClose, labelledBy, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    // A click on the dimmed area outside the sheet lands on the dialog itself and closes it.
    // Keyboards close it with Escape, which the dialog handles natively.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes a modal dialog
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="mx-0 mt-auto mb-0 max-h-[90dvh] w-full max-w-full overflow-y-auto rounded-t-sheet bg-paper p-0 text-ink shadow-float backdrop:bg-scrim sm:m-auto sm:max-w-md sm:rounded-sheet"
    >
      <div className="relative px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3"
        >
          <XIcon size={20} aria-hidden="true" />
        </Button>
        {children}
      </div>
    </dialog>
  );
}
