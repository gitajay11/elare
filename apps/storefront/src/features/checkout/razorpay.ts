import { loadScript } from '@elare/utils';
import { api } from '@/lib/api';

/** Set when `VITE_RAZORPAY_KEY_ID` is configured; "Pay online" is hidden otherwise. */
export const RAZORPAY_ENABLED = Boolean(import.meta.env.VITE_RAZORPAY_KEY_ID);

/**
 * Runs Razorpay Standard Checkout for an order that is already placed and
 * awaiting payment. Resolves once the API has verified the signature and
 * settled the order; rejects when the customer closes the modal, the payment
 * fails, or verification is refused (the order stays reserved for a retry).
 */
export async function payWithRazorpay(orderId: string, orderNumber: string): Promise<void> {
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  const rz = await api.razorpayOrder(orderId);
  if (!window.Razorpay) throw new Error('Payment gateway failed to load.');
  await new Promise<void>((resolve, reject) => {
    const instance = new window.Razorpay!({
      key: rz.key_id,
      amount: rz.amount,
      currency: rz.currency,
      name: 'Élaré Beauty',
      description: `Order ${orderNumber}`,
      order_id: rz.razorpay_order_id,
      prefill: rz.prefill,
      notes: { order_number: orderNumber },
      theme: { color: '#B85C78' },
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
