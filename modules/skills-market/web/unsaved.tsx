import { useCallback, useEffect, useRef } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { Button } from "@aihot/web/features/admin/ui";

export function UnsavedChanges({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (blocker.state === "blocked") dialog.current?.showModal(); }, [blocker.state]);
  useBeforeUnload(useCallback(event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }, [dirty]));
  return blocker.state === "blocked" ? <dialog ref={dialog} role="alertdialog" onCancel={e => { e.preventDefault(); blocker.reset(); }} aria-labelledby="skills-unsaved-title" aria-describedby="skills-unsaved-description" className="sm-dialog">
    <h2 id="skills-unsaved-title">还有未保存的修改</h2><p id="skills-unsaved-description" className="sm-muted mb-5">离开会丢弃当前表单内容。</p>
    <div className="flex gap-3"><Button autoFocus onClick={() => blocker.reset()}>继续编辑</Button><Button tone="danger" onClick={() => blocker.proceed()}>放弃并离开</Button></div>
  </dialog> : null;
}
