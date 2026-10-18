"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { keepDialogFocus } from "./dialogFocus";

export default function OrderCountdown({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(5);
  const dialog = useRef<HTMLDialogElement>(null),
    cancelled = useRef(false);
  const callbacks = useRef({ onComplete, onCancel });
  useEffect(() => {
    callbacks.current = { onComplete, onCancel };
  }, [onComplete, onCancel]);
  useEffect(() => {
    dialog.current?.showModal();
    cancelled.current = false;
    const start = performance.now();
    const timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((5000 - (performance.now() - start)) / 1000),
      );
      setSeconds(remaining);
      if (!remaining && !cancelled.current) {
        cancelled.current = true;
        clearInterval(timer);
        callbacks.current.onComplete();
      }
    }, 100);
    const pause = () => {
      if (document.hidden && !cancelled.current) {
        cancelled.current = true;
        callbacks.current.onCancel();
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      cancelled.current = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  function cancel() {
    if (cancelled.current) return;
    cancelled.current = true;
    onCancel();
  }
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      onKeyDown={keepDialogFocus}
      className="order-countdown"
      aria-labelledby="countdown-title"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <div className="countdown-content">
        <div className="countdown-mark">
          <Icon name="bag" size={30} />
        </div>
        <p className="eyebrow">One last moment</p>
        <h2 id="countdown-title">Your order is almost on its way.</h2>
        <p>You can still go back and make a change.</p>
        <div
          className="countdown-number"
          role="timer"
          aria-label={`Submitting in ${seconds} seconds`}
        >
          {seconds}
          <small>seconds to submit</small>
        </div>
        <button
          autoFocus
          type="button"
          className="btn-secondary"
          onClick={cancel}
        >
          Go back to my order
        </button>
        <small>Nothing is sent until the countdown ends.</small>
      </div>
    </dialog>
  );
}
