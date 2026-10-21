/* Delegação resiliente de controles do TeurChat.
   Este arquivo roda antes do aplicativo principal e encaminha cliques diretamente
   para as funções reais quando elas estiverem disponíveis. */
(function () {
  'use strict';
  var busy = false;
  function el(id) { return document.getElementById(id); }
  function message(title, body, retry) {
    var main = el('main');
    if (!main) return;
    main.innerHTML = '';
    var section = document.createElement('section');
    section.className = 'panel';
    section.style.margin = '16px';
    var h = document.createElement('h2'); h.className = 'section-title'; h.textContent = title;
    var p = document.createElement('p'); p.className = 'muted'; p.textContent = body;
    section.append(h, p);
    if (retry) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = 'Tentar novamente';
      b.addEventListener('click', retry); section.appendChild(b);
    }
    main.appendChild(section);
  }
  function run(fn, fallbackTitle) {
    try {
      var result = fn();
      if (result && typeof result.catch === 'function') result.catch(function (err) {
        console.error('TeurChat control failed:', err);
        message(fallbackTitle || 'Não foi possível concluir', err && err.message ? err.message : 'Tente novamente.', function () { location.reload(); });
      });
    } catch (err) {
      console.error('TeurChat control failed:', err);
      message(fallbackTitle || 'Não foi possível concluir', err && err.message ? err.message : 'Tente novamente.', function () { location.reload(); });
    }
  }
  function dispatch(button, event) {
    if (!button || button.disabled || busy) return false;
    var page = button.getAttribute('data-page');
    var feed = button.getAttribute('data-feed');
    var id = button.id;
    var action = button.matches('[data-like],[data-comment],[data-share],[data-delete],[data-follow],[data-bookmark],[data-report]');
    if (page && typeof window.setMainPage === 'function') {
      event.preventDefault(); event.stopImmediatePropagation(); busy = true;
      run(function () { return window.setMainPage(page); }, 'Não foi possível abrir esta seção');
      Promise.resolve().then(function () { busy = false; });
      return true;
    }
    if (feed && typeof window.loadFeed === 'function') {
      event.preventDefault(); event.stopImmediatePropagation();
      run(function () {
        window.feedMode = feed;
        document.querySelectorAll('[data-feed]').forEach(function (b) {
          var active = b === button;
          b.classList.toggle('primary', active);
          b.setAttribute('aria-pressed', String(active));
        });
        return window.loadFeed();
      }, 'Não foi possível atualizar o feed');
      return true;
    }
    if (action && typeof window.handleFeedClick === 'function') {
      event.preventDefault(); event.stopImmediatePropagation();
      run(function () { return window.handleFeedClick(event); }, 'A ação da publicação falhou');
      return true;
    }
    var fn = null;
    if (id === 'searchBtn') fn = function () { return typeof window.setMainPage === 'function' ? window.setMainPage('search') : message('Buscar', 'A busca ainda não terminou de iniciar.', function () { location.reload(); }); };
    else if (id === 'accountBtn') fn = function () { return typeof window.openProfile === 'function' && window.session ? window.openProfile() : typeof window.openAuth === 'function' ? window.openAuth('login') : message('Entrar', 'A tela de acesso ainda não terminou de iniciar.', function () { location.reload(); }); };
    else if (id === 'rightJoin') fn = function () { return typeof window.openAuth === 'function' ? window.openAuth('signup') : message('Criar conta', 'A tela de cadastro ainda não terminou de iniciar.', function () { location.reload(); }); };
    else if (id === 'mobileCreate' || id === 'topCreate') fn = function () { return typeof window.showComposer === 'function' ? window.showComposer() : message('Publicar', 'O editor ainda não terminou de iniciar.', function () { location.reload(); }); };
    else if (id === 'notificationsBtn') fn = function () { return typeof window.openNotifications === 'function' ? window.openNotifications() : message('Notificações', 'As notificações ainda não terminaram de iniciar.', function () { location.reload(); }); };
    else if (id === 'installBtn' || id === 'checkInstall' || button.onclick) fn = function () { if (button.onclick) return button.onclick.call(button, event); };
    if (fn) {
      event.preventDefault(); event.stopImmediatePropagation();
      run(fn, 'O botão não conseguiu concluir a ação');
      return true;
    }
    return false;
  }
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var button = target.closest('button, [role="button"], [data-page], [data-feed], [data-like], [data-comment], [data-share], [data-delete], [data-follow], [data-bookmark], [data-report]');
    if (!button) return;
    dispatch(button, event);
  }, true);
  window.addEventListener('error', function (event) {
    if (!event || !event.message) return;
    console.error('TeurChat runtime error:', event.message, event.filename, event.lineno);
  });
})();