/* Fallback de navegação independente: mantém os controles utilizáveis mesmo se o script principal falhar. */
(function () {
  'use strict';
  function byId(id) { return document.getElementById(id); }
  function showMessage(title, message, actionLabel, action) {
    var main = byId('main');
    if (!main) return;
    main.innerHTML = '';
    var panel = document.createElement('section');
    panel.className = 'panel';
    panel.style.margin = '16px';
    var h = document.createElement('h2'); h.className = 'section-title'; h.textContent = title;
    var p = document.createElement('p'); p.className = 'muted'; p.textContent = message;
    panel.append(h, p);
    if (actionLabel && action) {
      var b = document.createElement('button'); b.className = 'btn primary'; b.textContent = actionLabel;
      b.addEventListener('click', action); panel.appendChild(b);
    }
    main.appendChild(panel);
  }
  function fallbackPage(page) {
    var labels = {feed:'Início', explore:'Descobrir', chats:'Mensagens', profile:'Perfil', saved:'Publicações salvas', search:'Buscar', moderation:'Moderação'};
    document.querySelectorAll('[data-page]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-page') === page);
    });
    if (typeof window.setMainPage === 'function') {
      Promise.resolve(window.setMainPage(page)).catch(function () {
        showMessage(labels[page] || 'TeurChat', 'Esta seção não conseguiu carregar. Verifique a conexão e tente novamente.', 'Recarregar seção', function () { fallbackPage(page); });
      });
      return;
    }
    if (page === 'search' || page === 'explore') {
      showMessage('Buscar publicações', 'A interface principal não terminou de iniciar. Você pode tentar recarregar para restaurar a busca.', 'Recarregar TeurChat', function () { location.reload(); });
    } else if (page === 'chats' || page === 'profile' || page === 'saved') {
      showMessage(labels[page], 'A interface principal não terminou de iniciar. Recarregue o TeurChat para ativar esta função.', 'Recarregar TeurChat', function () { location.reload(); });
    } else {
      showMessage('TeurChat', 'O site está aberto, mas o carregamento principal falhou. Recarregue para tentar novamente.', 'Recarregar TeurChat', function () { location.reload(); });
    }
  }
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var pageButton = target.closest('[data-page]');
    if (pageButton) {
      event.preventDefault();
      if (typeof window.setMainPage === 'function') return;
      fallbackPage(pageButton.getAttribute('data-page'));
      return;
    }
    var id = target.closest('button[id]');
    if (!id) return;
    if (id.id === 'searchBtn') {
      event.preventDefault();
      if (typeof window.setMainPage === 'function') return;
      fallbackPage('search');
    } else if (id.id === 'accountBtn' || id.id === 'rightJoin' || id.id === 'mobileCreate' || id.id === 'topCreate') {
      if (id.id === 'mobileCreate' || id.id === 'topCreate') {
        if (typeof window.showComposer === 'function') return;
        showMessage('Publicar', 'O editor não terminou de iniciar. Recarregue o TeurChat para tentar publicar.', 'Recarregar TeurChat', function () { location.reload(); });
      } else if (typeof window.openAuth === 'function') return;
      else showMessage('Acessar conta', 'A tela de acesso não terminou de iniciar. Recarregue o TeurChat para continuar.', 'Recarregar TeurChat', function () { location.reload(); });
    } else if (id.id === 'notificationsBtn') {
      if (typeof window.openNotifications === 'function') return;
      showMessage('Notificações', 'As notificações não terminaram de iniciar. Recarregue o TeurChat para tentar novamente.', 'Recarregar TeurChat', function () { location.reload(); });
    }
  }, true);
})();