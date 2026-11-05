import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { useId, useLayoutEffect, useRef } from "react";

const hiddenDialog = { opacity: 0, scale: 0.98, y: 6 };
const dialogTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

export function ConfirmationActions({ onCancel, onConfirm, form, isBusy, confirmDisabled, danger }) {
  return (
    <>
      <button className="action-button secondary-action" type="button" onClick={onCancel} disabled={isBusy}>
        Отмена
      </button>
      <button
        className={`action-button${danger ? " danger-action" : ""}`}
        type={form ? "submit" : "button"}
        form={form}
        onClick={onConfirm}
        disabled={isBusy || confirmDisabled}
      >
        Подтвердить
      </button>
    </>
  );
}

export default function ModalDialog({ title, onClose, actions, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const isPresent = useIsPresent();
  const shouldReduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    titleRef.current.focus({ preventScroll: true });

    return () => dialog.close();
  }, []);

  return (
    <motion.dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby={titleId}
      data-closing={isPresent ? undefined : ""}
      initial={shouldReduceMotion ? false : hiddenDialog}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={shouldReduceMotion ? undefined : hiddenDialog}
      transition={shouldReduceMotion ? { duration: 0 } : dialogTransition}
      onCancel={(event) => {
        event.preventDefault();
        if (isPresent) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (isPresent && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="app-dialog-layout" inert={!isPresent}>
        <h2 id={titleId} ref={titleRef} tabIndex={-1}>{title}</h2>
        <div className="app-dialog-content">{children}</div>
        <div className="app-dialog-actions">{actions}</div>
      </div>
    </motion.dialog>
  );
}
