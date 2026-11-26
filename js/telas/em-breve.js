import { icone } from '../icones.js';
import { esc } from '../ui.js';

/** Cria uma tela provisória para funções de etapas futuras. */
export const emBreve = (nome, etapa) => ({
  titulo: nome,
  render(el) {
    el.innerHTML = `
      <div class="vazio">
        ${icone('ferramenta')}
        <h2>${esc(nome)}</h2>
        <p>Em construção — ${esc(etapa)}.</p>
        <a class="botao" href="#/">Voltar ao início</a>
      </div>`;
  },
});
