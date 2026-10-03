export const AREA_FACTORS = {m2:1, ft2:0.09290304, pyeong:400/121};
function value(v, min, max) { const s=String(v).trim(); if(s.length>30||!/^\d+(?:\.\d{1,6})?$/.test(s))throw new Error('NUMBER'); const n=Number(s);if(!Number.isFinite(n)||n<min||n>max)throw new Error('RANGE');return n; }
export function calculateQuantity(rooms, {unit='m2', coverage='1', waste='10', coats='1', price='0', type='tile'}={}) {
  if(!Array.isArray(rooms)||!rooms.length||rooms.length>20)throw new Error('ROOM_LIMIT');
  if(!Object.hasOwn(AREA_FACTORS,unit)||!['tile','paint'].includes(type))throw new Error('UNIT');
  const factor=AREA_FACTORS[unit], coverageM2=value(coverage,0.000001,1000000)*factor;
  const loss=value(waste,0,100), layers=type==='paint'?value(coats,1,10):1;
  if(!Number.isInteger(layers))throw new Error('COATS');
  const unitPrice=value(price,0,1000000000);
  const details=rooms.map((r,i)=>{const name=String(r.name||'').trim();if(!name||name.length>100)throw new Error('ROOM_NAME');return {name,index:i+1,area:value(r.area,0.000001,1000000),m2:value(r.area,0.000001,1000000)*factor};});
  const totalM2=details.reduce((a,r)=>a+r.m2,0);
  const neededM2=totalM2*layers*(1+loss/100);
  // All areas and coverage use one selected unit, so its conversion factor cancels.
  // Calculate the final ceiling as an exact rational, never with a floating tolerance.
  const scaled=v=>{const [a,b='']=String(v).split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));};
  const totalScaled=rooms.reduce((sum,r)=>sum+scaled(String(r.area).trim()),0n);
  const numerator=totalScaled*BigInt(layers)*(100000000n+scaled(String(waste).trim()));
  const denominator=100000000n*scaled(String(coverage).trim());
  const rawPacks=Number(numerator)/Number(denominator);
  const packs=Number((numerator+denominator-1n)/denominator);
  if(!Number.isSafeInteger(packs)||packs>1000000000)throw new Error('PACK_LIMIT');
  if(packs*unitPrice>1000000000000)throw new Error('COST_LIMIT');
  return {details,unit,type,layers,loss,totalM2,totalArea:totalM2/factor,neededM2,neededArea:neededM2/factor,coverageM2,rawPacks,packs,remainingM2:packs*coverageM2-neededM2,estimatedCost:packs*unitPrice};
}
export function quantityCsv(result) {
 const cell=v=>'"'+String(v).replaceAll('"','""')+'"';
 // Experimental mitigation only; spreadsheet behavior varies and values are changed.
 const safe=s=>/^[=+\-@]/.test(s.normalize('NFKC').replace(/^[\s\p{Cc}\p{Cf}]*/u,''))||/^[\t\r\n]/.test(s)?"'"+s:s;
 const rows=[['room','area',result.unit],...result.details.map(r=>[safe(r.name),r.area,result.unit]),['total_area',result.totalArea,result.unit],['waste_percent',result.loss,'%'],['coats',result.layers,''],['needed_area',result.neededArea,result.unit],['coverage_per_pack',result.coverageM2/AREA_FACTORS[result.unit],result.unit],['packs_rounded_up',result.packs,'packs'],['estimated_cost',result.estimatedCost,'user_currency']];
 return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');
}
