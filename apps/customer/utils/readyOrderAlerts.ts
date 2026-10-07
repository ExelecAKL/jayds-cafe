"use client";

interface ReadyOrderAlertOptions {
  orderId: string;
  orderNumber: string;
}

const READY_ORDER_VIBRATION_PATTERN = [350, 120, 350, 120, 700];

export function canRequestNativeNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNativeNotificationPermission():
  NotificationPermission | "unsupported" {
  if (!canRequestNativeNotifications()) return "unsupported";
  return Notification.permission;
}

export async function requestNativeNotificationPermission() {
  if (!canRequestNativeNotifications()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function vibrateReadyPulse() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(READY_ORDER_VIBRATION_PATTERN);
  }
}

export async function showReadyOrderNativeNotification({
  orderId,
  orderNumber,
}: ReadyOrderAlertOptions) {
  vibrateReadyPulse();

  if (
    !canRequestNativeNotifications() ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  const title = `${orderNumber} is ready for pickup`;
  const body = "Please proceed to the counter and show your pickup QR.";
  const url = `/orders/${orderId}`;
  const options: NotificationOptions & {
    badge?: string;
    renotify?: boolean;
    vibrate?: number[];
  } = {
    body,
    icon: "/icons/jayds-app-192.png",
    badge: "/icons/jayds-badge-96.png",
    tag: `ready-order-${orderId}`,
    renotify: true,
    vibrate: READY_ORDER_VIBRATION_PATTERN,
  };

  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      window.location.href = url;
      notification.close();
    };
    return true;
  } catch {
    const registration = await navigator.serviceWorker?.ready.catch(() => null);
    if (!registration) return false;

    await registration.showNotification(title, {
      ...options,
      data: { url },
    } as NotificationOptions);
    return true;
  }
}
