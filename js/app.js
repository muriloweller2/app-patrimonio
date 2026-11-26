// Ponto de entrada: rotas (#/...), navegação inferior, status de rede e service worker
import { icone } from './icones.js';
import * as inicio from './telas/inicio.js';
import * as ajustes from './telas/ajustes.js';
import { emBreve } from './telas/em-breve.js';

const ROTAS = {
  '': inicio,
  incorporar: emBreve('Incorporar', 'etapa 3'),
  bens: emBreve('Bens', 'etapa 6'),
  desincorporar: emBreve('Desincorporar', 'etapa 7'),
  cadastros: emBreve('Cadastros', 'etapa 3'),
  ajustes,
};

const ABAS = [
  ['', 'inicio', 'Início'],
  ['bens', 'lista', 'Bens'],
  ['cadastros', 'camadas', 'Cadastros'],
  ['ajustes', 'ajustes', 'Ajustes'],
];

const tela = document.getElementById('tela');
const nav = document.getElementById('abas');

nav.innerHTML = ABAS.map(([rota, ico, nome]) => `<a href="#/${rota}" data-rota="${rota}">${icone(ico)}${nome}</a>`).join('');

function navegar() {
  const rota = location.hash.replace(/^#\/?/, '').split('?')[0];
  const t = ROTAS[rota] || inicio;
  document.title = t.titulo === 'Patrimônio' ? 'Patrimônio' : `${t.titulo} · Patrimônio`;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.rota === rota) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  t.render(tela);
  window.scrollTo(0, 0);
  tela.focus({ preventScroll: true });
}

function atualizarRede() {
  const el = document.getElementById('rede');
  const on = navigator.onLine;
  el.textContent = on ? 'Online' : 'Offline';
  el.classList.toggle('off', !on);
}

window.addEventListener('hashchange', navegar);
window.addEventListener('online', atualizarRede);
window.addEventListener('offline', atualizarRede);
atualizarRede();
navegar();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
