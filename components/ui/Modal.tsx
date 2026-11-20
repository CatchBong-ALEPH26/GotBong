"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** 픽셀 대화 상자 형태의 확인창. Esc로 닫히고 닫힐 때 이전 포커스로 돌아간다. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const { title, onClose, children, actions } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal px" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2 className="px-tag">{title}</h2>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
