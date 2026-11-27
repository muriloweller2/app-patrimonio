// Ponto de entrada: rotas (#/...), navegação inferior, status de rede/envio e service worker
import { icone } from './icones.js';
import { iniciarSync, estado } from './sync.js';
import * as inicio from './telas/inicio.js';
import * as ajustes from './telas/ajustes.js';
import * as incorporar from './telas/incorporar.js';
import * as cadastros from './telas/cadastros.js';
import * as pendencias from './telas/pendencias.js';
import * as pesquisa from './telas/pesquisa.js';
import { emBreve } from './telas/em-breve.js';

const ROTAS = {
  '': inicio,
  incorporar,
  pesquisa,
  alterar: incorporar.alterarTela,
  bens: emBreve('Bens', 'etapa 6'),
  desincorporar: emBreve('Desincorporar', 'etapa 7'),
  cadastros,
  pendencias,
  ajustes,
};

const ABAS = [
  ['', 'inicio', 'Início'],
  ['pesquisa', 'busca', 'Pesquisa'],
  ['cadastros', 'camadas', 'Cadastros'],
  ['ajustes', 'ajustes', 'Ajustes'],
];

const tela = document.getElementById('tela');
const nav = document.getElementById('abas');
let rotaAtual = null;

nav.innerHTML = ABAS.map(([rota, ico, nome]) => `<a href="#/${rota}" data-rota="${rota}">${icone(ico)}${nome}</a>`).join('');

function navegar() {
  const rota = location.hash.replace(/^#\/?/, '').split('?')[0];
  rotaAtual = rota;
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

// Selo no topo: online/offline + itens aguardando envio
async function atualizarStatus() {
  const el = document.getElementById('rede');
  const s = await estado();
  const on = navigator.onLine;
  let txt = on ? 'Online' : 'Offline';
  let classe = on ? '' : 'off';
  if (s.erros) { txt = `${s.erros} com erro`; classe = 'erro'; }
  else if (s.enviando) { txt = 'Enviando…'; classe = 'envio'; }
  else if (s.pendentes) { txt = `${s.pendentes} p/ enviar`; classe = 'off'; }
  el.textContent = txt;
  el.className = `rede ${classe}`;
  el.href = '#/pendencias';
  // Tela de pendências se atualiza sozinha
  if (rotaAtual === 'pendencias' && !s.enviando) pendencias.render(tela);
}

window.addEventListener('hashchange', navegar);
window.addEventListener('online', atualizarStatus);
window.addEventListener('offline', atualizarStatus);
window.addEventListener('sync', atualizarStatus);

navegar();
atualizarStatus();
iniciarSync();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
