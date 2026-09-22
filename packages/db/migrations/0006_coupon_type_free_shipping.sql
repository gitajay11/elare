-- Coupons can waive the delivery fee. The enum value is added on its own
-- because Postgres refuses to use a new enum value in the transaction that
-- created it; 0007 wires it into the quote.
alter type coupon_type add value if not exists 'free_shipping';
