// Comunicação com o Google Apps Script (backend da planilha)
import { lerConfig } from './config.js';

const TEMPO_LIMITE = 25000;

/**
 * Chama uma ação do Apps Script. Retorna o objeto de resposta ({ok, ...}).
 * Lança erro em falha de rede, tempo esgotado ou resposta inválida.
 */
export async function chamar(action, dados = {}, cfg = lerConfig()) {
  if (!cfg.url || !cfg.token) throw new Error('Conexão não configurada. Vá em Ajustes.');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
  try {
    const resp = await fetch(cfg.url, {
      method: 'POST',
      // text/plain evita a verificação CORS (preflight) que o Apps Script não suporta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...dados, action, token: cfg.token }),
      signal: ctrl.signal,
    });
    const texto = await resp.text();
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error('Resposta inesperada. Confira se a URL termina em /exec e se o acesso está como "Qualquer pessoa".');
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Sem resposta da planilha (tempo esgotado).');
    if (err instanceof TypeError) throw new Error('Sem conexão com a internet ou URL inválida.');
    throw err;
  } finally {
    clearTimeout(t);
  }
}
