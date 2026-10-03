export const tFor = lang => (ko, en) => lang === 'en' ? en : ko;
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className' || key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (['value', 'checked', 'disabled', 'selected', 'multiple'].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  children.flat(Infinity).forEach(child => { if(child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child))); });
  return node;
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function download(blob, filename) {
  const url=URL.createObjectURL(blob), link=el('a',{href:url,download:filename}); document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KiB` : `${(n/1048576).toFixed(1)} MiB`;
export function field(label,input,hint) { const wrap=el('label',{class:'field'},el('span',{},label),input); if(hint)wrap.append(el('small',{},hint)); return wrap; }
export const button = (text, onClick, secondary=false) => el('button',{type:'button',class:`button${secondary?' secondary':''}`,onClick},text);
export function setDirty(value=true){window.dispatchEvent(new CustomEvent('workspace-dirty',{detail:value}));}
export function reportError(node,error){node.textContent=error instanceof Error?error.message:String(error);node.hidden=false;node.setAttribute('role','alert');}
export function inputNumber(value,min,max,step=1){return el('input',{type:'number',value,min,max,step});}
export function select(options,value){return el('select',{value},options.map(([v,label])=>el('option',{value:v,selected:v===String(value)},label)));}
export function isMobile(){return matchMedia('(max-width: 700px)').matches;}
export function clearNode(node){node.replaceChildren();}
export const nextFrame = () => new Promise(resolve => setTimeout(resolve,0));
