export const CURRENCIES = { KRW: 0, USD: 2, EUR: 2, GBP: 2, JPY: 0, CAD: 2, AUD: 2 };
const SCALE = 1000000n;
export function decimal(value, max = 1000000000) {
  const s = String(value).trim();
  if (s.length>30 || !/^\d+(?:\.\d{1,6})?$/.test(s) || Number(s) > max) throw new Error('INVALID_DECIMAL');
  const [a,b=''] = s.split('.'); return BigInt(a)*SCALE+BigInt(b.padEnd(6,'0'));
}
const roundDiv = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
export function calculateInvoice(items, {currency='KRW', discountPercent='0', taxPercent='0'} = {}) {
  if (!Object.hasOwn(CURRENCIES,currency)) throw new Error('CURRENCY');
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('ITEM_LIMIT');
  const digits=CURRENCIES[currency], factor=10n**BigInt(digits);
  const discountRate=decimal(discountPercent,100), taxRate=decimal(taxPercent,100);
  const lines=items.map(item=>{
    const quantity=decimal(item.quantity,1000000),price=decimal(item.price,1000000000);
    if (!String(item.name||'').trim() || String(item.name).length>200 || quantity<=0n) throw new Error('ITEM_INVALID');
    const amount=roundDiv(quantity*price*factor,SCALE*SCALE);
    return {...item,amount};
  });
  const subtotal=lines.reduce((a,x)=>a+x.amount,0n);
  if(subtotal>100000000000000n)throw new Error('TOTAL_LIMIT');
  const discount=roundDiv(subtotal*discountRate,100n*SCALE);
  const taxable=subtotal-discount;
  const tax=roundDiv(taxable*taxRate,100n*SCALE);
  return {currency,digits,lines,subtotal,discount,taxable,tax,total:taxable+tax};
}
export function money(minor,currency='KRW') {
  const digits=CURRENCIES[currency]; if(!Object.hasOwn(CURRENCIES,currency))throw new Error('CURRENCY');
  const n=BigInt(minor),factor=10n**BigInt(digits),whole=(n/factor).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return `${currency} ${whole}${digits?'.'+(n%factor).toString().padStart(digits,'0'):''}`;
}
