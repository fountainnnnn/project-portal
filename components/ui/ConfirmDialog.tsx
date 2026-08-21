import Button from './Button';
import Modal from './Modal';

/**
 * ConfirmDialog — the gate in front of every destructive action.
 *
 * `confirmLabel` is a full verb phrase ("Delete project"), never "OK" or
 * "Yes": someone who has stopped reading by the time they reach the buttons
 * should still be able to tell the two apart.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string; // e.g. 'Delete project'
  danger?: boolean; // confirm Button variant 'danger' vs 'primary'
  busy?: boolean; // disables both buttons while the request runs
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      // While the request is in flight, Escape and the scrim stop dismissing:
      // the delete is already happening and closing the dialog would only hide
      // whether it worked.
      onClose={busy ? () => {} : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[0.9375rem] leading-[1.55] text-[var(--ink-2)]">{body}</div>
    </Modal>
  );
}
