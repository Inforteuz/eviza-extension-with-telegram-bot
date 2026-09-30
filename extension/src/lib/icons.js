// Inline SVG icons (24×24 grid, currentColor) instead of emoji: identical on every OS
// and they follow the panel theme. Shapes follow Feather Icons (MIT).
const shapes={
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 refresh:'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
 refill:'<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
 upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
 check:'<path d="M20 6 9 17l-5-5"/>',
 checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
 alert:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
 back:'<path d="M19 12H5M12 19l-7-7 7-7"/>',
 play:'<path d="M6 4l14 8-14 8z" fill="currentColor"/>',
 stop:'<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
 trash:'<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
 edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
};
export const iconNames=Object.keys(shapes);
export function iconSvg(name,size=16){
 return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name]||''}</svg>`;
}
export function icon(name,size=16){
 const t=document.createElement('template');t.innerHTML=iconSvg(name,size);return t.content.firstElementChild;
}
// <button data-icon="play">Boshlash</button> gets the icon in front of its text.
export function hydrateIcons(root=document){
 for(const el of root.querySelectorAll('[data-icon]')){
  if(el.querySelector(':scope > svg.icon'))continue;
  el.prepend(icon(el.dataset.icon,Number(el.dataset.iconSize)||16));
 }
}
// Replace a button's text but keep its icon.
export function setLabel(el,text){
 const svg=el.querySelector(':scope > svg.icon');el.textContent=text;if(svg)el.prepend(svg);
}
