// Utilidades de interface
const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para colocar com segurança dentro de HTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);

let timer;
/** Mensagem rápida na parte de baixo da tela. tipo: '' | 'ok' | 'erro' */
export function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast mostrar ${tipo}`;
  clearTimeout(timer);
  timer = setTimeout(() => (el.className = 'toast'), tipo === 'erro' ? 4500 : 2500);
}
