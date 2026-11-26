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

/** Envolve o elemento numa caixa com um botão "x" por dentro; devolve o botão. */
export function botaoX(elem, icone, classe = '') {
  const caixa = document.createElement('span');
  caixa.className = ('limpavel ' + classe).trim();
  elem.replaceWith(caixa);
  caixa.appendChild(elem);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'limpar';
  btn.setAttribute('aria-label', 'Apagar');
  btn.innerHTML = icone('fechar');
  caixa.appendChild(btn);
  return btn;
}

/** Coloca um "x" dentro de cada campo de texto da área: aparece quando há algo digitado e apaga ao tocar. */
export function botoesLimpar(area, icone) {
  area.querySelectorAll('input.entrada, textarea.entrada').forEach((inp) => {
    const btn = botaoX(inp, icone, inp.tagName === 'TEXTAREA' ? 'limpavel--area' : '');
    const mostrar = () => { btn.hidden = !inp.value; };
    btn.onclick = () => { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); };
    inp.addEventListener('input', mostrar);
    inp.form?.addEventListener('reset', () => setTimeout(mostrar));
    mostrar();
  });
}
