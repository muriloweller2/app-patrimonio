import { icone } from '../icones.js';
import { lerConfig, salvarConfig } from '../config.js';
import { chamar } from '../api.js';
import { esc, toast } from '../ui.js';

export const titulo = 'Ajustes';

export function render(el) {
  const cfg = lerConfig();

  el.innerHTML = `
    <h2>Ajustes</h2>
    <p class="sub">Conexão com a planilha. Fica salva só neste celular.</p>

    <form class="cartao" id="form-cfg" autocomplete="off">
      <div class="campo">
        <label for="url">URL do Web App</label>
        <input class="entrada" id="url" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(cfg.url)}" required>
        <small>Apps Script → Implantar → URL que termina em /exec</small>
      </div>

      <div class="campo">
        <label for="token">Token</label>
        <div class="com-botao">
          <input class="entrada" id="token" type="password" value="${esc(cfg.token)}" required>
          <button class="botao botao--sec botao--icone" type="button" id="ver" aria-label="Mostrar token">${icone('olho')}</button>
        </div>
        <small>Planilha → menu Patrimônio → Mostrar token do app</small>
      </div>

      <div class="linha-botoes">
        <button class="botao botao--sec" type="button" id="testar">Testar</button>
        <button class="botao" type="submit">Salvar</button>
      </div>
      <div id="resultado" aria-live="polite"></div>
    </form>
  `;

  const $ = (id) => el.querySelector('#' + id);
  const lerCampos = () => ({ url: $('url').value.trim(), token: $('token').value.trim() });

  $('ver').onclick = () => {
    const t = $('token');
    t.type = t.type === 'password' ? 'text' : 'password';
  };

  $('form-cfg').onsubmit = (e) => {
    e.preventDefault();
    const novo = lerCampos();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(novo.url)) {
      toast('A URL deve começar com https://script.google.com e terminar em /exec', 'erro');
      return;
    }
    salvarConfig({ ...lerConfig(), ...novo }) ? toast('Salvo!', 'ok') : toast('Não foi possível salvar neste navegador', 'erro');
  };

  $('testar').onclick = async () => {
    const btn = $('testar');
    const res = $('resultado');
    btn.disabled = true;
    btn.textContent = 'Testando…';
    res.className = '';
    res.textContent = '';
    try {
      const r = await chamar('ping', {}, lerCampos());
      res.className = 'resultado ' + (r.ok ? 'ok' : 'erro');
      res.textContent = r.ok ? `Conectado à planilha "${r.planilha}".` : `Erro: ${r.erro}`;
    } catch (err) {
      res.className = 'resultado erro';
      res.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Testar';
    }
  };
}
