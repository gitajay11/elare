import { ApiError } from '@elare/utils';
import { api } from '@/lib/api';
import { CLEAR_CART_FLAG } from './razorpay';

/**
 * UPI QR via the store's self-hosted YouPI gateway. Shown only when
 * `VITE_YOUPI_ENABLED=true` (and the API refuses it while YOUPI_API_URL is unset).
 */
export const YOUPI_ENABLED = import.meta.env.VITE_YOUPI_ENABLED === 'true';

/**
 * Sends the customer to the gateway's checkout page for an order that is
 * already placed. The gateway brings them back to the order's confirmation
 * page, which checks the payment with the API. Resolves only when the order
 * turns out to be paid already; otherwise the page navigates away.
 */
export async function payWithYoupi(orderId: string): Promise<void> {
  // Reaching the confirmation page for this order empties the bag.
  sessionStorage.setItem(CLEAR_CART_FLAG, orderId);
  let session: Awaited<ReturnType<typeof api.youpiSession>>;
  try {
    session = await api.youpiSession(orderId);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'already_paid') return;
    throw e;
  }
  window.location.assign(session.checkout_url);
  await new Promise<never>(() => {});
}

/** Asks the API to settle a pending UPI QR order from the gateway's records. */
export async function reconcileYoupi(orderId: string): Promise<boolean> {
  try {
    return (await api.youpiReconcile(orderId)).paid;
  } catch {
    return false;
  }
}
