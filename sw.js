// Service worker: deixa o app abrir sem internet.
// Estratégia: tenta a rede (versão mais nova), e se falhar ou demorar usa o cache.
const CACHE = 'patrimonio-v11';
const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/estilo.css',
  'js/app.js',
  'js/api.js',
  'js/config.js',
  'js/icones.js',
  'js/ui.js',
  'js/db.js',
  'js/dados.js',
  'js/sync.js',
  'js/componentes.js',
  'js/cadastros.js',
  'js/leitor.js',
  'js/foto.js',
  'js/telas/inicio.js',
  'js/telas/ajustes.js',
  'js/telas/em-breve.js',
  'js/telas/incorporar.js',
  'js/telas/cadastros.js',
  'js/telas/pendencias.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // API do Google passa direto

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await Promise.race([
        fetch(req, { cache: 'no-cache' }), // sempre confere se há versão nova (GitHub guarda 10 min)
        new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 3000)),
      ]);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch {
      return (await cache.match(req, { ignoreSearch: true }))
        || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
