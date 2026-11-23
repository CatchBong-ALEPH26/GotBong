"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** 픽셀 대화 상자 형태의 확인창. Esc로 닫히고 닫힐 때 이전 포커스로 돌아간다. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const { title, onClose, children, actions } = props;
  const ref = useRef<HTMLDivElement>(null);
  // onClose는 렌더마다 새로 만들어질 수 있다. 최신 것을 ref로 들고, 포커스 처리는 열릴 때 한 번만 한다.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      // Tab이 창 밖(뒤쪽 화면)으로 나가지 않게 가둔다.
      if (e.key === "Tab" && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, input, select, [href], [tabindex]:not([tabindex='-1'])");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus();
    };
  }, []);
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
