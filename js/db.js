// IndexedDB: armazenamento local do celular (funciona sem internet)
// Stores: fila (operações a enviar), historico (resumo do que foi feito), kv (dados em cache e preferências)
const NOME = 'patrimonio';
const VERSAO = 1;
let conexao;

function abrir() {
  conexao ||= new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('fila', { keyPath: 'id' });
      d.createObjectStore('historico', { keyPath: 'id' });
      d.createObjectStore('kv');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
  return conexao;
}

async function transacao(store, modo, fn) {
  const d = await abrir();
  return new Promise((ok, falha) => {
    const t = d.transaction(store, modo);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => falha(t.error);
  });
}

export const db = {
  todos: (store) => transacao(store, 'readonly', (s) => s.getAll()),
  ler: (store, chave) => transacao(store, 'readonly', (s) => s.get(chave)),
  gravar: (store, valor, chave) => transacao(store, 'readwrite', (s) => (chave === undefined ? s.put(valor) : s.put(valor, chave))),
  apagar: (store, chave) => transacao(store, 'readwrite', (s) => s.delete(chave)),
};
