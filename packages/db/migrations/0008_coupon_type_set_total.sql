-- Test coupons that fix the amount payable (e.g. TEST → ₹1). Enum value added
-- on its own; 0009 wires it into the quote.
alter type coupon_type add value if not exists 'set_total';
