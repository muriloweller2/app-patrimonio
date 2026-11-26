import { icone } from '../icones.js';
import { configurado } from '../config.js';
import { db } from '../db.js';
import { lerDados } from '../dados.js';
import { ehHoje } from '../ui.js';

export const titulo = 'Patrimônio';

const acao = (rota, ico, cor, nome, desc) => `
  <a class="acao" href="#/${rota}" style="--c: var(${cor})">
    <span class="acao__ico">${icone(ico)}</span>
    <span class="acao__txt"><strong>${nome}</strong><small>${desc}</small></span>
    ${icone('seta')}
  </a>`;

export async function render(el) {
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const doDia = (await db.todos('historico')).filter((h) => ehHoje(h.quando));
  const conta = (a) => doDia.filter((h) => h.action === a).length;
  const d = await lerDados();

  el.innerHTML = `
    ${configurado() ? '' : `
      <div class="aviso">${icone('ferramenta')}
        <div>A conexão com a planilha ainda não foi configurada. <a href="#/ajustes">Configurar agora</a></div>
      </div>`}

    <h2>Olá!</h2>
    <p class="sub">${hoje.charAt(0).toUpperCase() + hoje.slice(1)}</p>

    <div class="acoes">
      ${acao('incorporar', 'mais', '--cor-incorporar', 'Incorporar', 'Cadastrar um bem novo')}
      ${acao('bens', 'editar', '--cor-alterar', 'Alterar / Transferir', 'Buscar um bem e mudar dados ou setor')}
      ${acao('desincorporar', 'baixa', '--cor-desincorporar', 'Desincorporar', 'Nº de patrimônio e descrição')}
    </div>

    <p class="secao">Cadastros</p>
    <div class="atalhos">
      <a href="#/cadastros?aba=grupos">${icone('camadas')}<span>Grupos</span><small>${d.grupos.length}</small></a>
      <a href="#/cadastros?aba=subgrupos">${icone('lista')}<span>Subgrupos</span><small>${d.subgrupos.length}</small></a>
      <a href="#/cadastros?aba=locais">${icone('local')}<span>Locais</span><small>${d.locais.length}</small></a>
      <a href="#/cadastros?aba=situacoes">${icone('etiqueta')}<span>Situações</span><small>${d.situacoes.length}</small></a>
    </div>

    <p class="secao">Hoje, neste celular</p>
    <div class="resumo">
      <div class="cartao"><b>${conta('incorporar')}</b><span>Incorporados</span></div>
      <div class="cartao"><b>${conta('alterar')}</b><span>Alterados</span></div>
      <div class="cartao"><b>${conta('desincorporar')}</b><span>Desincorp.</span></div>
    </div>
  `;
}
