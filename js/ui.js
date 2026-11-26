// Utilidades de interface
const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para colocar com segurança dentro de HTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);

/** Minúsculas e sem acentos, para buscas e comparações. */
export const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

let timer;
/** Mensagem rápida na parte de baixo da tela. tipo: '' | 'ok' | 'erro' | 'aviso' */
export function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast mostrar ${tipo}`;
  clearTimeout(timer);
  timer = setTimeout(() => (el.className = 'toast'), tipo === 'erro' ? 5000 : 2800);
}

/** Data/hora curta: "26/11 14:05" */
export const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const ehHoje = (iso) => new Date(iso).toDateString() === new Date().toDateString();
