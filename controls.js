/* Integração segura dos controles do TeurChat.
   O aplicativo principal já registra os eventos de navegação, feed, formulários e ações.
   Este arquivo não intercepta cliques: isso evita bloquear listeners próprios e eventos
   de elementos criados dinamicamente. */
(function () {
  'use strict';

  if (window.__teurControlsSafetyInstalled) return;
  window.__teurControlsSafetyInstalled = true;

  window.addEventListener('error', function (event) {
    if (!event || !event.message) return;
    console.error('[TeurChat] Erro de interface:', event.message, event.filename || '', event.lineno || '');
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (!event) return;
    console.error('[TeurChat] Ação rejeitada:', event.reason);
  });

  // Mantém os controles nativos do app como fonte única de eventos.
  // Não registrar listener de captura em document e não executar onclick manualmente.
})();