import { Check } from 'lucide-react';
import { ORDER_FLOW, ORDER_STATUS_LABEL } from '@elare/config';
import { cn, formatDateTime } from '@elare/utils';
import type { Order } from '@elare/types';
import { StatusPill } from './Primitives';

/** Order status timeline, shared by the storefront order page and the admin order detail. */
export function OrderTimeline({ order }: { order: Order }) {
  const terminal = ['cancelled', 'refund_requested', 'refund_initiated', 'refund_processing', 'refunded'].includes(order.status);
  const currentIdx = ORDER_FLOW.indexOf(order.status as (typeof ORDER_FLOW)[number]);
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between"><h3 className="text-xl">Status</h3><StatusPill status={order.status} label={ORDER_STATUS_LABEL[order.status]} /></div>
      {terminal ? (
        <p className="mt-3 text-sm text-ink-soft">{order.status === 'cancelled' ? `This order was cancelled${order.cancel_reason ? ` — ${order.cancel_reason}` : ''}.` : 'Your refund is being handled. We’ll email you at each step.'}</p>
      ) : (
        <ol className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ORDER_FLOW.map((s, i) => {
            const done = i <= currentIdx;
            return (
              <li key={s} className="flex flex-col items-center text-center">
                <span className={cn('grid h-7 w-7 place-items-center rounded-full border text-[11px]', done ? 'border-rose bg-rose text-white' : 'border-line text-mist')}>{done ? <Check size={13} /> : i + 1}</span>
                <span className={cn('mt-1.5 text-[11px] leading-tight', done ? 'font-semibold text-ink' : 'text-mist')}>{ORDER_STATUS_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
      )}
      <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-[12.5px] text-ink-soft">
        {order.history.map((h, i) => <li key={i} className="flex justify-between gap-3"><span>{ORDER_STATUS_LABEL[h.status]}{h.note ? ` — ${h.note}` : ''}</span><span className="shrink-0 text-mist">{formatDateTime(h.at)}</span></li>)}
      </ul>
    </div>
  );
}
