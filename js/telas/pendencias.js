import { icone } from '../icones.js';
import { db } from '../db.js';
import { enviar, descartar, tentarDeNovo, tentarTodos, estado, recarregarDados } from '../sync.js';
import { esc, dataHora } from '../ui.js';
import { configurado, usaDadosMoveis, tipoConexao } from '../config.js';

export const titulo = 'Envios pendentes';

const NOMES = {
  incorporar: 'Incorporação', alterar: 'Alteração', desincorporar: 'Desincorporação',
  salvarGrupo: 'Grupo', excluirGrupo: 'Excluir grupo', salvarSubgrupo: 'Subgrupo', excluirSubgrupo: 'Excluir subgrupo',
  salvarLocal: 'Localização', excluirLocal: 'Excluir localização', salvarSituacao: 'Situação', excluirSituacao: 'Excluir situação',
};

const resumo = (op) => {
  if (op.bem) return `Nº ${op.bem.patrimonio} · ${op.bem.descricao || ''}`;
  if (op.patrimonio) return `Nº ${op.patrimonio} · ${op.descricao || ''}`;
  return [op.grupo, op.nome].filter(Boolean).join(' › ');
};

export async function render(el) {
  const fila = (await db.todos('fila')).sort((a, b) => a.criado - b.criado);
  const st = await estado();

  el.innerHTML = `
    <h2>Envios pendentes</h2>
    <p class="sub">${fila.length ? `${fila.length} item(ns) ainda não chegaram na planilha.` : 'Tudo enviado para a planilha.'}</p>
    ${!configurado() ? `<div class="aviso">${icone('ferramenta')}<div>Configure a conexão em <a href="#/ajustes">Ajustes</a>.</div></div>` : ''}
    ${st.ultimoErro ? `<div class="aviso">${icone('alerta')}<div>Último envio falhou: ${esc(st.ultimoErro)}</div></div>` : ''}
    ${fila.length ? `<button class="botao botao--bloco" id="enviar" ${st.enviando ? 'disabled' : ''}>${icone('nuvem')} ${st.enviando ? 'Enviando…' : `Enviar ${fila.length - st.erros || ''} para a planilha`}</button>` : `<div class="vazio">${icone('nuvem')}</div>`}
    ${st.erros > 1 ? `<button class="botao botao--sec botao--bloco" id="todos" ${st.enviando ? 'disabled' : ''}>Tentar de novo os ${st.erros} recusados</button>` : ''}
    <ul class="lista lista--fila">
      ${fila.map((op) => `
        <li class="${op.estado === 'erro' ? 'com-erro' : ''}">
          <div>
            <strong>${NOMES[op.action] || op.action}</strong>
            <span>${esc(resumo(op))}</span>
            <small>${dataHora(op.quando)} · ${op.estado === 'erro' ? `<b>Recusado:</b> ${esc(op.erro)}` : 'Aguardando envio'}</small>
          </div>
          ${op.estado === 'erro' ? `
            <div class="lista__acoes">
              <button class="botao botao--sec" data-tentar="${op.id}">Tentar de novo</button>
              <button class="botao botao--perigo" data-descartar="${op.id}">Descartar</button>
            </div>` : ''}
        </li>`).join('')}
    </ul>
  `;

  // Só no Wi-Fi + dados móveis agora = confirma antes (fotos gastam dados)
  const liberado = () => usaDadosMoveis() || tipoConexao() !== 'movel'
    || confirm('Você está nos dados móveis e escolheu "Só no Wi-Fi" em Ajustes. Enviar mesmo assim?');
  el.querySelector('#enviar')?.addEventListener('click', async () => { if (!liberado()) return; await enviar(true); render(el); });
  el.querySelector('#todos')?.addEventListener('click', async () => { if (!liberado()) return; await tentarTodos(); render(el); });
  el.querySelectorAll('[data-tentar]').forEach((b) => (b.onclick = async () => { if (!liberado()) return; await tentarDeNovo(b.dataset.tentar); render(el); }));
  el.querySelectorAll('[data-descartar]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Descartar este item? Ele não será enviado para a planilha.')) return;
    await descartar(b.dataset.descartar);
    await recarregarDados(); // recarrega os dados da planilha para desfazer a mudança local (não envia nada)
    render(el);
  }));
}
