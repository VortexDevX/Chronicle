/** Generic dialog/modal utilities. */

export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
): void {
  const dialog = document.getElementById("confirm-dialog") as HTMLDialogElement;
  (document.getElementById("confirm-title") as HTMLElement).textContent = title;
  (document.getElementById("confirm-message") as HTMLElement).textContent =
    message;

  const okBtn = document.getElementById("confirm-ok")!;
  const cancelBtn = document.getElementById("confirm-cancel")!;

  // Clone & replace to remove old listeners
  const newOk = okBtn.cloneNode(true) as HTMLElement;
  const newCancel = cancelBtn.cloneNode(true) as HTMLElement;
  okBtn.replaceWith(newOk);
  cancelBtn.replaceWith(newCancel);

  newOk.addEventListener("click", () => {
    dialog.close();
    onConfirm();
  });
  newCancel.addEventListener("click", () => {
    dialog.close();
    onCancel?.();
  });

  dialog.showModal();
}
