import { icone } from '../icones.js';
import { configurado } from '../config.js';

export const titulo = 'Patrimônio';

const acao = (rota, ico, cor, nome, desc) => `
  <a class="acao" href="#/${rota}" style="--c: var(${cor})">
    <span class="acao__ico">${icone(ico)}</span>
    <span class="acao__txt"><strong>${nome}</strong><small>${desc}</small></span>
    ${icone('seta')}
  </a>`;

export function render(el) {
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

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

    <p class="secao">Hoje</p>
    <div class="resumo">
      <div class="cartao"><b>–</b><span>Incorporados</span></div>
      <div class="cartao"><b>–</b><span>Alterados</span></div>
      <div class="cartao"><b>–</b><span>Desincorp.</span></div>
    </div>
  `;
}
