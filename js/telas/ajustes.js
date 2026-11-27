import { icone } from '../icones.js';
import { lerConfig, salvarConfig, tipoConexao } from '../config.js';
import { chamar } from '../api.js';
import { enviar } from '../sync.js';
import { esc, toast, botoesLimpar } from '../ui.js';

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

    <div class="cartao">
      <div class="campo">
        <span class="rotulo">Enviar usando dados móveis?</span>
        <div class="segmentado" role="radiogroup">
          <label><input type="radio" name="dados" value="sim" ${cfg.dadosMoveis !== false ? 'checked' : ''}><span>Sim</span></label>
          <label><input type="radio" name="dados" value="nao" ${cfg.dadosMoveis === false ? 'checked' : ''}><span>Só no Wi-Fi</span></label>
        </div>
        <small>${{ wifi: 'Agora: conectado no Wi-Fi.', movel: 'Agora: usando dados móveis.', desconhecida: 'Este celular não informa se é Wi-Fi ou dados móveis; nesse caso o app sempre envia.' }[tipoConexao()]}
        Com "Só no Wi-Fi", o que você cadastrar fica guardado no celular e vai sozinho quando conectar no Wi-Fi (ou pelo botão Enviar agora).</small>
      </div>
    </div>
  `;

  const $ = (id) => el.querySelector('#' + id);
  botoesLimpar(el, icone);
  const lerCampos = () => ({ url: $('url').value.trim(), token: $('token').value.trim() });

  el.querySelectorAll('input[name="dados"]').forEach((r) => (r.onchange = () => {
    salvarConfig({ ...lerConfig(), dadosMoveis: r.value === 'sim' });
    toast(r.value === 'sim' ? 'Vai enviar também pelos dados móveis' : 'Vai enviar só no Wi-Fi', 'ok');
    enviar();
  }));

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
    if (!salvarConfig({ ...lerConfig(), ...novo })) return toast('Não foi possível salvar neste navegador', 'erro');
    toast('Salvo!', 'ok');
    enviar(); // baixa grupos, subgrupos, localizações e bens da planilha
  };

  $('testar').onclick = async () => {
    const btn = $('testar');
    const res = $('resultado');
    btn.disabled = true;
    btn.textContent = 'Testando…';
    res.className = '';
    res.textContent = '';
    try {
      const campos = lerCampos();
      const r = await chamar('ping', {}, campos);
      // Conectou: já salva, para os envios usarem a mesma URL/token que foi testada
      if (r.ok) { salvarConfig({ ...lerConfig(), ...campos }); enviar(true); }
      res.className = 'resultado ' + (r.ok ? 'ok' : 'erro');
      res.textContent = r.ok ? `Conectado à planilha "${r.planilha}". ` + (r.versao ? `Script atualizado (${r.versao}). Salvo.` : "⚠ Script ANTIGO: atualize o Apps Script (Nova versão).") : `Erro: ${r.erro}`;
    } catch (err) {
      res.className = 'resultado erro';
      res.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Testar';
    }
  };
}
