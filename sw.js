/* Visão Circular — Service Worker
 * Antes o SW era uma string embutida no index.html registrada por blob: URL.
 * Como os bytes nunca mudavam, o navegador nunca detectava versao nova e quem
 * tinha o app instalado ficava preso na primeira versao para sempre.
 *
 * IMPORTANTE: a cada publicacao, incremente SW_VERSION.
 */
const SW_VERSION = '2026-09-11-4';
const CACHE = 'vc-' + SW_VERSION;

// Assets estaveis que valem cache. O HTML NAO entra aqui (ver estrategia abaixo).
const PRECACHE = [
  './intro.jpg',
  './marca/logo-badge-512.png',
  './marca/icone-192.png',
  './marca/icone-512.png'
];

self.addEventListener('install', (e) => {
  // De proposito SEM skipWaiting automatico: assumir o controle no meio da
  // sessao forcaria um reload e poderia apagar um formulario pela metade
  // (um checkout, um cadastro de anuncio). Na PRIMEIRA instalacao nao ha
  // worker anterior, entao este aqui ativa na hora de qualquer jeito.
  // Numa atualizacao, o novo worker espera todas as abas fecharem — e o HTML
  // e network-first, entao as correcoes de conteudo chegam antes disso.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))  // limpa versoes velhas
      ))
      .then(() => self.clients.claim())
  );
});

// Permite que a pagina peça a troca imediata quando detecta versao nova.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca cachear API/auth/storage do Supabase nem chamadas ao Mercado Pago.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('mercadopago.com')) return;

  // HTML -> network-first: a correcao publicada chega na proxima abertura.
  // (cache-first era o motivo de nenhuma atualizacao alcancar quem ja instalou)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./')))
    );
    return;
  }

  // Demais assets -> cache-first com revalidacao em segundo plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
