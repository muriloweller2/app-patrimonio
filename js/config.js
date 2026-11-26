// Configurações salvas só neste celular (URL do Apps Script e token). Nunca vão para o código.
const CHAVE = 'patrimonio.config';

export function lerConfig() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || {};
  } catch {
    return {};
  }
}

export function salvarConfig(cfg) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

export const configurado = () => {
  const c = lerConfig();
  return Boolean(c.url && c.token);
};
