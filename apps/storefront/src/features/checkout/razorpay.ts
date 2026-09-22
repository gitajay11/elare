import { ApiError, loadScript } from '@elare/utils';
import { api } from '@/lib/api';

/** Set when `VITE_RAZORPAY_KEY_ID` is configured; "Pay online" is hidden otherwise. */
export const RAZORPAY_ENABLED = Boolean(import.meta.env.VITE_RAZORPAY_KEY_ID);

/** sessionStorage key: order id whose confirmation page should empty the bag. */
export const CLEAR_CART_FLAG = 'elare:clear-cart-for';

/**
 * Phones (and the installed app) get Razorpay's redirect mode: UPI hands off
 * to another app, which frequently kills this page before the in-page success
 * handler can run. In redirect mode Razorpay POSTs the result to the API,
 * which verifies it and sends the browser straight to the confirmation page.
 */
const useRedirectFlow = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(pointer: coarse)').matches ||
    /android|iphone|ipad|ipod/i.test(navigator.userAgent));

/**
 * Runs Razorpay Standard Checkout for an order that is already placed and
 * awaiting payment. Resolves once the order is settled; rejects when the
 * customer closes the modal, the payment fails, or verification is refused
 * (the order stays reserved for a retry). In redirect mode the promise never
 * settles — the page navigates away.
 */
export async function payWithRazorpay(orderId: string, orderNumber: string): Promise<void> {
  // Whatever happens next, reaching the confirmation page for this order empties the bag.
  sessionStorage.setItem(CLEAR_CART_FLAG, orderId);
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  let rz: Awaited<ReturnType<typeof api.razorpayOrder>>;
  try {
    rz = await api.razorpayOrder(orderId);
  } catch (e) {
    // A payment already went through (e.g. a UPI app switch); nothing to pay.
    if (e instanceof ApiError && e.status === 409) return;
    throw e;
  }
  if (!window.Razorpay) throw new Error('Payment gateway failed to load.');
  const redirect = useRedirectFlow();
  await new Promise<void>((resolve, reject) => {
    const instance = new window.Razorpay!({
      key: rz.key_id,
      amount: rz.amount,
      currency: rz.currency,
      name: 'Élaré Beauty',
      description: `Order ${orderNumber}`,
      image: `${location.origin}/logo-email.png`,
      order_id: rz.razorpay_order_id,
      prefill: rz.prefill,
      notes: { order_number: orderNumber },
      theme: { color: '#B85C78' },
      callback_url: rz.callback_url,
      redirect,
      modal: { ondismiss: () => reject(new Error('Payment was not completed. Your order is saved — you can retry any time.')) },
      handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try {
          await api.razorpayVerify({ order_id: orderId, ...r });
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    });
    instance.on('payment.failed', (r) => {
      const reason = (r as { error?: { description?: string } })?.error?.description;
      reject(new Error(reason ? `Payment failed: ${reason}` : 'Payment failed. Please try again or choose another method.'));
    });
    instance.open();
  });
}

/** Asks the API to settle a pending online order from Razorpay's records. */
export async function reconcilePayment(orderId: string): Promise<boolean> {
  try {
    return (await api.razorpayReconcile(orderId)).paid;
  } catch {
    return false;
  }
}
