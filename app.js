(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { client: null, session: null, profile: null, page: 'home', feed: 'all', posts: [], search: '', busy: false, badges: [], viewedProfileId: null, isAdmin: false, adminUsers: [], activeConversationId: null, chatChannel: null, followListMode: null, adminStats: {}, adminReports: [], realtimeChannel: null, realtimeTimer: null, rendering: false, pendingRealtimeRefresh: false };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials = v => (String(v || 'U').trim()[0] || 'U').toUpperCase();
  const notice = (msg, type = '') => {
    let el = $('#notice');
    if (!el) { el = document.createElement('div'); el.id = 'notice'; el.className = 'notice'; document.body.append(el); }
    el.textContent = msg; el.dataset.type = type; el.classList.add('show');
    clearTimeout(notice.timer); notice.timer = setTimeout(() => el.classList.remove('show'), 3500);
  };
  const isSignedIn = () => !!state.session?.user;
  const authRequired = () => { if (!isSignedIn()) { openModal('auth'); notice('Entre na sua conta para continuar.'); return false; } return true; };
  const setBusy = (yes) => { state.busy = yes; $$('[data-busy]').forEach(b => { b.disabled = yes; }); };
  function go(page, writeHistory = true) {
    const allowed = ['home','explore','saved','messages','profile','notifications','admin','support'];
    state.page = allowed.includes(page) ? page : 'home';
    if (writeHistory) {
      const nextHash = '#' + state.page;
      if (location.hash !== nextHash) history.pushState({ page: state.page }, '', nextHash);
    }
    document.body.dataset.page = state.page;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.go === state.page));
    $('#pageTitle').textContent = ({home:'Início',explore:'Explorar',saved:'Salvos',messages:'Mensagens',profile:'Meu perfil',notifications:'Notificações',admin:'Administração',support:'Central de ajuda'})[state.page];
    const adminNav = $('#adminNav'); if (adminNav) adminNav.hidden = !state.isAdmin;
    return renderPage().catch(e => { console.error(e); notice('Não foi possível abrir esta área: ' + (e.message || 'erro')); });
  }
  function openModal(kind, extra = {}) {
    const modal = $('#modal'); if (!modal) return;
    modal.dataset.kind = kind; modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
    const body = $('#modalBody');
    if (kind === 'auth') {
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">BEM-VINDO AO TEURCHAT</p><h2 id="authTitle">Entre na sua conta</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><div class="auth-switch"><button class="switch active" data-auth-mode="login">Entrar</button><button class="switch" data-auth-mode="signup">Criar conta</button></div><form id="authForm"><label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="voce@email.com"></label><label>Senha<input name="password" type="password" minlength="6" autocomplete="current-password" required placeholder="Mínimo de 6 caracteres"></label><div id="signupFields" hidden><label>Nome de usuário<input name="username" autocomplete="username" minlength="3" maxlength="24" placeholder="seunome"></label><label>Como quer ser chamado?<input name="display_name" maxlength="40" placeholder="Seu nome"></label></div><button class="btn primary full" data-busy type="submit" id="authSubmit">Entrar</button><p class="muted small">Sua conta é protegida pelo Supabase do TeurChat.</p></form>';
    } else if (kind === 'compose') {
      if (!authRequired()) return;
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">COMPARTILHE COM A COMUNIDADE</p><h2>Nova publicação</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><form id="postForm"><label>Foto ou vídeo<input name="media" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" required></label><p class="muted small">Fotos e vídeos de até 100 MB por arquivo.</p><label>Título<input name="title" required maxlength="100" placeholder="Título da publicação"></label><label>Descrição<textarea name="body" required maxlength="1200" rows="4" placeholder="Descreva sua foto ou vídeo..."></textarea></label><div class="form-foot"><span class="muted small">Título até 100 caracteres</span><button class="btn primary" type="submit" data-busy>Publicar ↗</button></div></form>';
    } else if (kind === 'comment') {
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">CONVERSA</p><h2>Comentários</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><div id="commentList" class="comment-list"><div class="loading">Carregando comentários…</div></div>' + (isSignedIn() ? '<form id="commentForm" data-post-id="' + esc(extra.postId) + '"><label>Seu comentário<textarea name="body" required maxlength="500" rows="3" placeholder="Escreva um comentário..."></textarea></label><button class="btn primary full" type="submit" data-busy>Enviar comentário</button></form>' : '<p class="muted small">Entre na sua conta para comentar.</p><button class="btn primary full" data-action="auth">Entrar para comentar</button>'); loadComments(extra.postId).catch(e=>{const box=$('#commentList');if(box)box.innerHTML='<p class="muted">Não foi possível carregar comentários: '+esc(e.message)+'</p>';});
    }
  }
  function closeModal() { $('#modal')?.classList.remove('open'); $('#modal')?.setAttribute('aria-hidden','true'); }
  async function ensureClient() {
    const cfg = window.TEURCHAT_CONFIG;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase?.createClient) throw new Error('Configuração do Supabase indisponível.');
    state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    state.session = data.session;
    if (state.session) await loadProfile();
    state.client.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      setTimeout(async () => { state.profile = null; if (session) await loadProfile().catch(console.error); updateAccountUI(); await renderPage().catch(console.error); }, 0);
    });
    updateAccountUI();
    setupRealtime();
  }
  function setupRealtime() {
    if (!state.client || state.realtimeChannel) return;
    const channel = state.client.channel('teurchat-live-updates');
    ['posts','likes','comments','follows','profiles','notifications','messages','conversations','conversation_members','community_cases','reports','bookmarks'].forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
        // Avoid replacing a form while someone is typing or closing an interaction.
        if (state.page === 'messages' && ['messages','conversations','conversation_members'].includes(table)) {
          if (table === 'messages' && state.activeConversationId && payload.new?.conversation_id === state.activeConversationId) {
            loadChatMessages(state.activeConversationId).catch(console.error);
          }
          loadChatList({reopenActive:false}).catch(console.error);
          return;
        }
        if ($('#modal')?.classList.contains('open') || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
          state.pendingRealtimeRefresh = true;
          return;
        }
        // Likes and comments update counters in place; don't rebuild the feed or interrupt video playback.
        if (['home','explore','profile','saved'].includes(state.page) && ['likes','comments'].includes(table)) {
          const postId = payload.new?.post_id || payload.old?.post_id;
          if (postId) {
            clearTimeout(state.realtimeTimer);
            state.realtimeTimer = setTimeout(() => refreshPostMetrics(postId).catch(err => console.error('Atualização de contadores:', err)), 180);
          }
          return;
        }
        // Update only the visible area affected by this event; never reload the document.
        const relevant =
          (['home','explore'].includes(state.page) && ['posts','likes','comments','follows','profiles'].includes(table)) ||
          (state.page === 'saved' && ['posts','bookmarks','likes','comments'].includes(table)) ||
          (state.page === 'profile' && ['posts','likes','comments','follows','profiles'].includes(table)) ||
          (state.page === 'notifications' && table === 'notifications') ||
          (state.page === 'support' && table === 'community_cases') ||
          (state.page === 'admin' && ['community_cases','reports','profiles'].includes(table));
        if (!relevant) return;
        clearTimeout(state.realtimeTimer);
        state.realtimeTimer = setTimeout(async () => {
          if (document.visibilityState !== 'visible') { state.pendingRealtimeRefresh = true; return; }
          try {
            if (state.page === 'home' || state.page === 'explore') await renderFeed({silent:true});
            else if (state.page === 'notifications') await renderNotificationsPage();
            else if (state.page === 'support') await loadMyCases();
            else if (state.page === 'admin') {
              if (table === 'community_cases') await loadAdminCases();
              else if (table === 'reports') await loadAdminReports();
              else await renderAdminPage();
            } else await renderPage();
          } catch (err) { console.error('Atualização em tempo real:', err); }
        }, 300);
      });
    });
    state.realtimeChannel = channel.subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Canal em tempo real indisponível:', status);
      }
    });
  }
  document.addEventListener('focusout', () => {
    if (!state.pendingRealtimeRefresh || $('#modal')?.classList.contains('open')) return;
    setTimeout(() => {
      if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
      state.pendingRealtimeRefresh = false;
      renderPage().catch(console.error);
    }, 150);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.pendingRealtimeRefresh && !$('#modal')?.classList.contains('open')) {
      state.pendingRealtimeRefresh = false;
      renderPage().catch(console.error);
    }
  });
  window.addEventListener('popstate', () => {
    const hash = location.hash || '#home';
    const shared = /^#post-([0-9a-f-]{36})$/i.exec(hash);
    if (shared) {
      go('home', false).then(() => openSharedPost(shared[1]).catch(e => notice('Não foi possível abrir a publicação: '+e.message,'error')));
      return;
    }
    go(hash.slice(1), false);
  });
  async function loadProfile() {
    const user = state.session?.user;
    if (!user) { state.profile = null; state.badges = []; state.isAdmin = false; const adminNav = $('#adminNav'); if (adminNav) adminNav.hidden = true; return; }
    const columns = 'id,username,display_name,bio,avatar_url,banner_url';
    let result = await state.client.from('profiles').select(columns).eq('id', user.id).maybeSingle();
    if (result.error) throw result.error;
    let profile = result.data;
    if (!profile) {
      const meta = user.user_metadata || {};
      const base = String(meta.username || ('user_' + user.id.replace(/-/g,'').slice(0,10))).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24);
      const candidate = base.length >= 3 ? base : 'user_' + user.id.replace(/-/g,'').slice(0,10);
      const display = String(meta.display_name || candidate).trim().slice(0,40) || candidate;
      let created = await state.client.from('profiles').upsert({id:user.id, username:candidate, display_name:display, bio:''}, {onConflict:'id'}).select(columns).maybeSingle();
      if (created.error && created.error.code === '23505') {
        const uniqueName = ('user_' + user.id.replace(/-/g,'').slice(-12)).slice(0,24);
        created = await state.client.from('profiles').upsert({id:user.id, username:uniqueName, display_name:display, bio:''}, {onConflict:'id'}).select(columns).maybeSingle();
      }
      if (created.error) throw created.error;
      profile = created.data;
      if (!profile) {
        const retry = await state.client.from('profiles').select(columns).eq('id',user.id).single();
        if (retry.error) throw retry.error;
        profile = retry.data;
      }
    }
    state.profile = profile;
    const adminCheck = await state.client.rpc('teurchat_is_admin');
    state.isAdmin = !adminCheck.error && adminCheck.data === true;
    const adminNav = $('#adminNav'); if (adminNav) adminNav.hidden = !state.isAdmin;
    try {
      const badges = await state.client.from('profile_badges').select('badge_key').eq('user_id',user.id);
      if (badges.error && badges.error.code !== '42P01') throw badges.error;
      state.badges = (badges.data || []).map(row => row.badge_key);
    } catch (error) {
      console.warn('Insígnias indisponíveis:', error);
      state.badges = [];
    }
  }
  function updateAccountUI() {
    const p = state.profile, btn = $('#accountButton');
    if (btn) btn.innerHTML = isSignedIn() ? '<span class="avatar tiny">' + (p?.avatar_url && /^https:\/\//i.test(p.avatar_url) ? '<img src="' + esc(p.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : esc(initials(p?.display_name || p?.username || 'U'))) + '</span><span class="account-label">' + esc(p?.display_name || p?.username || 'Minha conta') + '</span>' : '<span class="avatar tiny">' + svgIcon('user') + '</span><span class="account-label">Entrar</span>';
    $('#composeButton').disabled = false;
    $('#sessionHint').textContent = isSignedIn() ? '@' + (p?.username || 'usuario') : 'Entre para publicar, curtir e conversar.';
  }
  const profileCover = p => '<div class="profile-cover"' + (p?.banner_url && /^https:\/\//i.test(p.banner_url) ? ' style="background-image:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.35)),url(&quot;' + esc(p.banner_url) + '&quot;)"' : '') + '></div>';
  const avatar = p => '<span class="avatar">' + (p?.avatar_url && /^https:\/\//i.test(p.avatar_url) ? '<img src="' + esc(p.avatar_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : esc(initials(p?.display_name || p?.username || 'U'))) + '</span>';
  const badgeMeta = {
    admin: { label: 'Administrador', icon: 'shield-check' },
    bug_hunter: { label: 'Caçador de Bugs', icon: 'bug' },
    verified: { label: 'Verificado', icon: 'badge-check' }, partner: { label: 'Parceiro', icon: 'handshake' }
  };
  function renderBadges(keys) {
    return (keys || []).map(k => { const meta = badgeMeta[k] || {label:String(k).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),icon:'badge-check'}; return '<span class="profile-badge badge-' + esc(k) + '" title="' + esc(meta.label) + '">' + svgIcon(meta.icon) + '<span>' + esc(meta.label) + '</span></span>'; }).join('');
  }
  function svgIcon(name) {
    const paths = {
      home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8z"/>',
      bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/>',
      heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>',
      comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8z"/>',
      share: '<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M5 13v7h14v-7"/>',
      'shield-check': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
      bug: '<path d="m8 9-2-2m10 2 2-2M9 4l1 2m5-2-1 2M4 13h4m8 0h4M5 19l3-2m8 0 3 2"/><rect x="7" y="7" width="10" height="14" rx="5"/><path d="M12 8v12"/>',
      'badge-check': '<path d="m12 3 2.2 1.3 2.6-.1 1.1 2.4 2.2 1.4-.5 2.6.5 2.6-2.2 1.4-1.1 2.4-2.6-.1L12 18l-2.2-1.3-2.6.1-1.1-2.4-2.2-1.4.5-2.6-.5-2.6 2.2-1.4 1.1-2.4 2.6.1z"/><path d="m8.5 10.5 2.2 2.2 4.8-4.8"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      'external-link': '<path d="M14 3h7v7M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 'handshake': '<path d="m8 12 2 2a2 2 0 0 0 3 0l3-3M4 9l4-4 4 2 3-1 5 4-7 8a2 2 0 0 1-3 0l-3-3-3-3"/>'
    };
    return '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.user) + '</svg>';
  }
  function renderPost(p) {
    const profile = p.profiles || {};
    const liked = Array.isArray(p.likes) && p.likes.some(x => x.user_id === state.session?.user?.id);
    const likes = p.likes?.length || 0, comments = p.comments?.length || 0;
    const type = p.media_type || (/\.(mp4|webm|mov)(\?|$)/i.test(p.media_url || '') ? 'video' : 'image');
    const isReel = ['home','explore'].includes(state.page) && !!p.media_url;
    const author = '<button class="avatar-button" data-action="view-profile" data-id="' + esc(p.user_id) + '" aria-label="Ver perfil">' + avatar(profile) + '</button><button class="post-author profile-open" data-action="view-profile" data-id="' + esc(p.user_id) + '"><strong>' + esc(profile.display_name || profile.username || 'Usuário TeurChat') + '</strong><span>@' + esc(profile.username || 'usuario') + '</span></button>';
    const media = p.media_url ? (type === 'video' ? '<video class="post-media' + (isReel?' reel-media':'') + '" src="' + esc(p.media_url) + '" ' + (isReel?'autoplay muted loop':'controls') + ' playsinline preload="metadata"></video>' : '<img class="post-media' + (isReel?' reel-image':'') + '" src="' + esc(p.media_url) + '" alt="' + esc(p.title || 'Foto da publicação') + '" loading="lazy">') : '';
    const actions = '<button class="action ' + (liked?'selected':'') + '" data-action="like" data-id="' + esc(p.id) + '" aria-label="Curtir" aria-pressed="' + (liked?'true':'false') + '"><span>' + svgIcon('heart') + '</span><b>' + likes + '</b></button><button class="action" data-action="comment" data-id="' + esc(p.id) + '" aria-label="Comentários"><span>' + svgIcon('comment') + '</span><b>' + comments + '</b></button><button class="action" data-action="save" data-id="' + esc(p.id) + '" aria-label="Salvar"><span>' + svgIcon('bookmark') + '</span><b>Salvar</b></button><button class="action share-action" data-action="share" data-id="' + esc(p.id) + '" aria-label="Compartilhar"><span>' + svgIcon('share') + '</span><b>Enviar</b></button>';
    if (isReel) {
      return '<article class="post-card reel-card" data-post="' + esc(p.id) + '"><div class="reel-video-wrap">' + media + '<div class="reel-shade"></div></div><div class="reel-top">' + author + '<button class="icon-btn post-more" data-action="post-more" data-id="' + esc(p.id) + '" aria-label="Mais opções">' + svgIcon('more') + '</button></div><div class="reel-caption">' + (p.title?'<h3 class="post-title">' + esc(p.title) + '</h3>':'') + '<p>' + esc(p.body || '') + '</p><span class="reel-audio">♫  Áudio original · @' + esc(profile.username || 'usuario') + '</span></div><div class="reel-actions">' + actions + '</div></article>';
    }
    return '<article class="post-card" data-post="' + esc(p.id) + '"><div class="post-top">' + author + '<button class="icon-btn post-more" data-action="post-more" data-id="' + esc(p.id) + '" aria-label="Mais opções">' + svgIcon('more') + '</button></div>' + (p.title ? '<h3 class="post-title">' + esc(p.title) + '</h3>' : '') + media + '<div class="post-body">' + esc(p.body) + '</div><div class="post-actions">' + actions + '</div></article>';
  }
  async function loadComments(postId) {
    const box = $('#commentList'); if (!box) return;
    const {data,error} = await state.client.from('comments').select('id,body,created_at,user_id,profiles!comments_user_id_fkey(username,display_name,avatar_url)').eq('post_id',postId).order('created_at',{ascending:true}).limit(100);
    if (error) throw error;
    box.innerHTML = data?.length ? data.map(x => '<article class="comment-row">' + avatar(x.profiles || {}) + '<div><strong>' + esc(x.profiles?.display_name || x.profiles?.username || 'Usuário') + ' <span>@' + esc(x.profiles?.username || 'usuario') + '</span></strong><p>' + esc(x.body) + '</p><small>' + esc(new Date(x.created_at).toLocaleString('pt-BR')) + '</small>' + (state.isAdmin ? '<button class="action" data-action="admin-delete-comment" data-id="' + esc(x.id) + '">' + svgIcon('close') + ' Remover</button>' : '') + '</div></article>').join('') : '<p class="muted">Ainda não há comentários. Seja a primeira pessoa a comentar.</p>';
  }
  async function openUserProfile(userId) {
    const {data:p,error} = await state.client.from('profiles').select('id,username,display_name,bio,avatar_url,banner_url').eq('id',userId).single();
    if (error) throw error;
    const {data:userBadgeRows} = await state.client.from('profile_badges').select('badge_key').eq('user_id',userId);
    const publicBadges=(userBadgeRows||[]).map(row=>row.badge_key);
    const {data:posts,error:postError} = await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url,profile_badges(badge_key)),likes(user_id),comments(id)').eq('user_id',userId).order('created_at',{ascending:false}).limit(40);
    if (postError) throw postError;
    state.posts = posts || []; state.viewedProfileId = userId;
    $('#feedFilters').hidden = true; $('#searchBar').hidden = true; $('#pageTitle').textContent = '@' + (p.username || 'perfil');
    const own = userId === state.session?.user?.id;
    const [followers,following,followState]=await Promise.all([state.client.from('follows').select('follower_id',{count:'exact',head:true}).eq('followed_id',userId),state.client.from('follows').select('followed_id',{count:'exact',head:true}).eq('follower_id',userId),own?Promise.resolve({data:null}):state.client.from('follows').select('follower_id').eq('follower_id',state.session?.user?.id||'00000000-0000-0000-0000-000000000000').eq('followed_id',userId).maybeSingle()]);
    const followingThis=!!followState.data;
    $('#content').innerHTML = '<button class="btn secondary" data-action="back-feed">← Voltar ao feed</button><section class="profile-card">' + profileCover(p) + '<div class="profile-info">' + avatar(p) + '<h2>' + esc(p.display_name || p.username) + '</h2><p>@' + esc(p.username) + '</p><div class="profile-badges">' + renderBadges(publicBadges) + '</div><div class="profile-stats"><button data-action="open-follow-list" data-id="'+esc(p.id)+'" data-kind="followers"><strong>'+(followers.count||0)+'</strong><span>Seguidores</span></button><button data-action="open-follow-list" data-id="'+esc(p.id)+'" data-kind="following"><strong>'+(following.count||0)+'</strong><span>Seguindo</span></button><span><strong>'+state.posts.length+'</strong><span>Publicações</span></span><span><strong>'+state.posts.reduce((sum,post)=>sum+(post.likes?.length||0),0)+'</strong><span>Curtidas recebidas</span></span></div><p>' + esc(p.bio || '') + '</p>' + (own ? '<button class="btn secondary" data-action="edit-profile">Editar perfil</button>' : '<button class="btn '+(followingThis?'secondary':'primary')+'" data-action="follow" data-id="' + esc(p.id) + '" data-username="' + esc(p.username) + '">'+(followingThis?'Seguindo · Deixar de seguir':'Seguir')+'</button><button class="btn secondary" data-action="start-chat" data-id="'+esc(p.id)+'" data-username="'+esc(p.username)+'">Mensagem</button><button class="btn secondary" data-action="report-user" data-id="'+esc(p.id)+'" data-username="'+esc(p.username)+'">Denunciar perfil</button>') + '</div></section><section class="panel"><div class="section-heading"><h3>Publicações de @' + esc(p.username) + '</h3><span class="muted small">'+state.posts.length+' itens</span></div><div id="userPosts">' + (state.posts.length ? state.posts.map(renderPost).join('') : '<p class="muted">Este perfil ainda não publicou fotos ou vídeos.</p>') + '</div></section>';
  }  async function openSharedPost(postId) {
    if (!/^[0-9a-f-]{36}$/i.test(postId)) return;
    let card = $('#content [data-post="'+CSS.escape(postId)+'"]');
    if (!card) {
      const {data,error} = await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url,profile_badges(badge_key)),likes(user_id),comments(id)').eq('id',postId).maybeSingle();
      if (error) throw error;
      if (!data) { notice('Esta publicação não está disponível.'); return; }
      state.posts = [data, ...state.posts.filter(p => p.id !== data.id)];
      const holder = document.createElement('div');
      holder.innerHTML = renderPost(data);
      card = holder.firstElementChild;
      $('#content').prepend(card);
      setupReelPlayback($('#content'));
    }
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('shared-post-highlight');
    setTimeout(() => card.classList.remove('shared-post-highlight'), 2200);
  }
  async function fetchPosts() {
    let query = state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url,profile_badges(badge_key)),likes(user_id),comments(id)').order('created_at',{ascending:false}).limit(40);
    if (state.page === 'explore' && state.search) query = query.ilike('body','%' + state.search.replace(/[%_]/g,'') + '%');
    if (state.feed === 'following' && isSignedIn()) {
      const {data: follows, error: fErr} = await state.client.from('follows').select('followed_id').eq('follower_id',state.session.user.id);
      if (fErr) throw fErr;
      const ids = (follows || []).map(x=>x.followed_id);
      if (!ids.length) return [];
      query = query.in('user_id',ids);
    }
    const {data,error} = await query;
    if (error) throw error;
    return data || [];
  }

  async function refreshPostMetrics(postId) {
    const card = $('#content [data-post="'+CSS.escape(postId)+'"]');
    if (!card || !state.client) return;
    const [likesResult, commentsResult] = await Promise.all([
      state.client.from('likes').select('user_id').eq('post_id',postId),
      state.client.from('comments').select('id').eq('post_id',postId)
    ]);
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;
    const post = state.posts.find(p => p.id === postId);
    if (post) { post.likes = likesResult.data || []; post.comments = commentsResult.data || []; }
    const likeButton = card.querySelector('[data-action="like"]');
    if (likeButton) {
      const liked = !!state.session?.user && (likesResult.data || []).some(x => x.user_id === state.session.user.id);
      likeButton.classList.toggle('selected',liked);
      likeButton.setAttribute('aria-pressed',String(liked));
      const count = likeButton.querySelector('b'); if (count) count.textContent = String((likesResult.data || []).length);
    }
    const commentButton = card.querySelector('[data-action="comment"] b');
    if (commentButton) commentButton.textContent = String((commentsResult.data || []).length);
  }
  let reelObserver = null;
  function setupReelPlayback(root) {
    if (reelObserver) reelObserver.disconnect();
    const videos = $$('video.reel-media', root);
    if (!videos.length || !('IntersectionObserver' in window)) return;
    reelObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) video.play().catch(() => {});
      else video.pause();
    }), {threshold:[0,0.65,1]});
    videos.forEach(video => reelObserver.observe(video));
  }
  function reconcileFeedCards(posts, target) {
    const current = new Map($('[data-post]', target).map(card => [card.dataset.post, card]));
    const wanted = new Set(posts.map(post => String(post.id)));
    for (const [id, card] of current) if (!wanted.has(id)) card.remove();
    for (const post of posts) {
      const id = String(post.id);
      let card = current.get(id);
      if (!card) {
        const holder = document.createElement('div');
        holder.innerHTML = renderPost(post);
        card = holder.firstElementChild;
      }
      if (card) target.appendChild(card);
    }
    state.posts = posts;
    setupReelPlayback(target);
  }
  async function renderFeed({silent = false} = {}) {
    const target = $('#content');
    if (!silent || !target.children.length) target.innerHTML = '<div class="loading"><span class="spinner"></span><span>Carregando publicações…</span></div>';
    try {
      const loadedPosts = await fetchPosts();
      if (silent && target.querySelector('[data-post]') && loadedPosts.length) {
        reconcileFeedCards(loadedPosts, target);
        return;
      }
      state.posts = loadedPosts;
      if (!state.posts.length) {
        target.innerHTML = '<section class="empty-state"><div class="empty-mark">' + svgIcon('plus') + '</div><h2>' + (state.page==='explore'?'Nada encontrado por enquanto':'Sua comunidade começa aqui') + '</h2><p>' + (state.page==='explore'?'Tente outra busca ou volte mais tarde.':'Ainda não há publicações para mostrar. Seja a primeira pessoa a compartilhar algo.') + '</p><button class="btn primary" data-action="compose">Criar publicação</button></section>';
        return;
      }
      target.innerHTML = state.posts.map(renderPost).join('');
      setupReelPlayback(target);
    } catch (e) {
      console.error(e);
      if (silent) return;
      target.innerHTML = '<section class="empty-state"><div class="empty-mark">' + svgIcon('shield-check') + '</div><h2>Não foi possível carregar o feed</h2><p>' + esc(e.message || 'Verifique a conexão e as permissões do banco.') + '</p><button class="btn primary" data-action="refresh">Tentar novamente</button></section>';
    }
  }
  async function renderPage() {
    if (!state.client) return;
    if (['home','explore','saved'].includes(state.page)) {
      $('#feedFilters').hidden = state.page !== 'home';
      $('#searchBar').hidden = state.page !== 'explore';
      if (state.page === 'saved') {
        if (!authRequired()) { go('home'); return; }
        const {data,error} = await state.client.from('bookmarks').select('post_id').eq('user_id',state.session.user.id);
        if (error) { $('#content').innerHTML='<div class="empty-state"><h2>Salvos indisponíveis</h2><p>O banco ainda não oferece a tabela de salvos. '+esc(error.message)+'</p></div>'; return; }
        const ids = (data||[]).map(x=>x.post_id);
        if (!ids.length) { $('#content').innerHTML='<div class="empty-state"><h2>Nenhuma publicação salva</h2><p>Use “Salvar” em uma publicação para encontrá-la aqui.</p></div>'; return; }
        const {data:posts,error:e} = await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url,profile_badges(badge_key)),likes(user_id),comments(id)').in('id',ids).order('created_at',{ascending:false});
        if (e) throw e; state.posts=posts||[]; $('#content').innerHTML=state.posts.map(renderPost).join(''); return;
      }
      await renderFeed(); return;
    }
    $('#feedFilters').hidden = true; $('#searchBar').hidden = true;
    if (state.page === 'profile') {
      if (!authRequired()) { go('home'); return; }
      const p = state.profile || {};
      const [followers,following]=await Promise.all([state.client.from('follows').select('follower_id',{count:'exact',head:true}).eq('followed_id',state.session.user.id),state.client.from('follows').select('followed_id',{count:'exact',head:true}).eq('follower_id',state.session.user.id)]);
      $('#content').innerHTML = '<section class="profile-card">' + profileCover(p) + '<div class="profile-info">' + avatar(p) + '<h2>' + esc(p.display_name || 'Meu perfil') + '</h2><p>@' + esc(p.username || 'usuario') + '</p><div class="profile-badges">' + renderBadges(state.badges) + '</div><div class="profile-stats"><button data-action="open-follow-list" data-id="'+esc(state.session.user.id)+'" data-kind="followers"><strong>'+(followers.count||0)+'</strong><span>Seguidores</span></button><button data-action="open-follow-list" data-id="'+esc(state.session.user.id)+'" data-kind="following"><strong>'+(following.count||0)+'</strong><span>Seguindo</span></button></div><p>' + esc(p.bio || 'Adicione uma descrição ao seu perfil.') + '</p><div class="profile-completion"><div><span>Perfil completo</span><strong>' + Math.round(([p.avatar_url,p.bio,p.banner_url].filter(Boolean).length / 3) * 100) + '%</strong></div><div class="completion-track"><span style="width:' + Math.round(([p.avatar_url,p.bio,p.banner_url].filter(Boolean).length / 3) * 100) + '%"></span></div></div><button class="btn secondary" data-action="edit-profile">' + svgIcon('user') + ' Editar perfil</button>' + (state.isAdmin ? '<button class="btn primary" data-action="admin-panel">' + svgIcon('shield-check') + ' Painel administrativo</button>' : '') + '<button class="btn secondary" data-action="signout">Sair da conta</button></div></section><section class="panel"><h3>Minhas publicações</h3><div id="myPosts"><div class="loading">Carregando…</div></div></section>';
      const {data,error}=await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url,profile_badges(badge_key)),likes(user_id),comments(id)').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(30);
      if(error) throw error; $('#myPosts').innerHTML=data?.length?data.map(renderPost).join(''):'<p class="muted">Você ainda não publicou nada.</p>'; return;
    }
    if (state.page === 'admin') { if (!state.isAdmin) { notice('Esta área é exclusiva da administração.', 'error'); go('home'); return; } await renderAdminPage(); return; }
    if (state.page === 'support') { await renderSupportPage(); return; }
    if (state.page === 'messages') { if (!authRequired()) { go('home'); return; } await renderMessagesPage(); return; }
    if (state.page === 'notifications') { if (!authRequired()) { go('home'); return; } await renderNotificationsPage(); return; }
  }

  async function renderMessagesPage() {
    $('#content').innerHTML='<section class="chat-layout"><aside class="chat-sidebar"><div class="section-heading"><div><p class="eyebrow">INBOX</p><h2>Mensagens</h2></div><button class="btn secondary" data-action="chat-refresh">↻</button></div><form id="chatSearchForm" class="search-form"><input id="chatSearch" placeholder="Buscar pessoa" autocomplete="off"><button class="btn secondary" type="submit">Buscar</button></form><div id="chatPeople"></div><div id="chatList"><div class="loading">Carregando conversas…</div></div></aside><section class="chat-window" id="chatWindow"><div class="empty-state"><h3>Suas conversas</h3><p>Escolha uma conversa ou procure uma pessoa para enviar mensagem.</p></div></section></section>';
    await loadChatList();
  }
  async function loadChatList({reopenActive = true} = {}) {
    const box=$('#chatList');if(!box||!state.session?.user)return;
    const {data,error}=await state.client.from('conversations').select('id,created_at,conversation_members(user_id,profiles!conversation_members_user_id_fkey(id,username,display_name,avatar_url))').order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    const items=(data||[]).map(c=>({...c,other:(c.conversation_members||[]).find(m=>m.user_id!==state.session.user.id)?.profiles})).filter(c=>c.other);
    box.innerHTML=items.length?items.map(c=>'<button class="chat-person '+(state.activeConversationId===c.id?'active':'')+'" data-action="open-chat" data-id="'+esc(c.id)+'">'+avatar(c.other)+'<span><strong>'+esc(c.other.display_name||c.other.username)+'</strong><small>@'+esc(c.other.username)+'</small></span></button>').join(''):'<p class="muted small">Nenhuma conversa ainda. Busque uma pessoa acima para começar.</p>';
    if(state.activeConversationId&&!items.some(c=>c.id===state.activeConversationId))state.activeConversationId=null;
    if(reopenActive && state.activeConversationId)await openConversation(state.activeConversationId);
  }
  async function searchChatPeople(term) {
    const out=$('#chatPeople');if(!out)return;
    const clean=String(term||'').trim().replace(/^@/,'').replace(/[%_]/g,'');
    if(!clean){out.innerHTML='';return;}
    const {data,error}=await state.client.from('profiles').select('id,username,display_name,avatar_url').or('username.ilike.%'+clean+'%,display_name.ilike.%'+clean+'%').neq('id',state.session.user.id).limit(10);
    if(error)throw error;
    out.innerHTML=(data||[]).map(p=>'<button class="chat-person" data-action="start-chat" data-id="'+esc(p.id)+'" data-username="'+esc(p.username)+'">'+avatar(p)+'<span><strong>'+esc(p.display_name||p.username)+'</strong><small>@'+esc(p.username)+'</small></span><b>+</b></button>').join('')||'<p class="muted small">Nenhuma pessoa encontrada.</p>';
  }
  async function startChat(userId,username) {
    if(!authRequired())return;
    const {data,error}=await state.client.rpc('start_direct_conversation',{target_user:userId});if(error)throw error;
    state.activeConversationId=data;state.page='messages';await go('messages');notice('Conversa com @'+username+' aberta.','success');
  }
  async function openConversation(conversationId) {
    state.activeConversationId=conversationId;
    const box=$('#chatWindow');if(!box)return;
    const {data:members,error:memberError}=await state.client.from('conversation_members').select('user_id,profiles!conversation_members_user_id_fkey(id,username,display_name,avatar_url)').eq('conversation_id',conversationId);
    if(memberError)throw memberError;
    const other=(members||[]).find(m=>m.user_id!==state.session.user.id)?.profiles||{};
    box.innerHTML='<header class="chat-header">'+avatar(other)+'<div><strong>'+esc(other.display_name||other.username||'Conversa')+'</strong><small>@'+esc(other.username||'usuario')+'</small></div><button class="btn secondary" data-action="chat-refresh">Atualizar</button></header><div id="chatMessages" class="chat-messages"><div class="loading">Carregando mensagens…</div></div><form id="messageForm" data-conversation-id="'+esc(conversationId)+'" class="chat-compose"><label class="chat-attach" title="Enviar foto ou vídeo">＋<input name="attachment" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden></label><textarea name="body" maxlength="2000" rows="1" placeholder="Escreva uma mensagem…"></textarea><button class="btn primary" type="submit">Enviar</button></form><p class="chat-media-hint">Fotos ou vídeos de até 200 MB; vídeos de até 10 minutos.</p>';
    await loadChatMessages(conversationId);
  }
  async function loadChatMessages(conversationId) {
    const box=$('#chatMessages');if(!box)return;
    const {data,error}=await state.client.from('messages').select('id,body,sender_id,created_at,attachment_url,attachment_type,attachment_name,profiles!messages_sender_id_fkey(username,display_name)').eq('conversation_id',conversationId).order('created_at',{ascending:true}).limit(200);
    if(error)throw error;
    for(const m of (data||[])){if(m.attachment_url){const signed=await state.client.storage.from('chat-media').createSignedUrl(m.attachment_url,3600);if(signed.error){console.warn('Anexo indisponível:',signed.error.message);m.attachment_url=null;}else m.attachment_url=signed.data.signedUrl;}}
    box.innerHTML=(data||[]).map(m=>'<article class="chat-bubble '+(m.sender_id===state.session.user.id?'mine':'')+'">'+(m.attachment_url?(m.attachment_type==='video'?'<video class="chat-attachment" src="'+esc(m.attachment_url)+'" controls playsinline preload="metadata"></video>':'<a href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener"><img class="chat-attachment" src="'+esc(m.attachment_url)+'" alt="'+esc(m.attachment_name||'Foto recebida')+'" loading="lazy"></a>'):'')+(m.body?'<p>'+esc(m.body)+'</p>':'')+'<time>'+esc(new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))+'</time></article>').join('')||'<p class="muted small">Comece a conversa com uma mensagem.</p>';
    box.scrollTop=box.scrollHeight;
  }
  async function sendMessage(form) {
    if(!authRequired())return;
    const fd=new FormData(form),body=String(fd.get('body')||'').trim(),file=fd.get('attachment'),conversation_id=form.dataset.conversationId;
    if(!body&&(!file||!file.size))return;
    if(file&&file.size>200*1024*1024){notice('O arquivo ultrapassa 200 MB.','error');return;}
    if(file&&(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))){notice('Envie uma foto ou vídeo compatível.','error');return;}
    const submit=form.querySelector('button[type=submit]');if(submit)submit.disabled=true;
    try{
      let attachment_url=null,attachment_type=null,attachment_name=null;
      if(file&&file.size){
        if(file.type.startsWith('video/')){const duration=await new Promise((resolve,reject)=>{const v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>{URL.revokeObjectURL(v.src);resolve(v.duration)};v.onerror=()=>{URL.revokeObjectURL(v.src);reject(new Error('Não foi possível verificar a duração do vídeo.'))};v.src=URL.createObjectURL(file)});if(!Number.isFinite(duration)||duration>600)throw new Error('O vídeo deve ter no máximo 10 minutos.');}
        const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';const path=state.session.user.id+'/'+conversation_id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;
        const {data:uploaded,error:uploadError}=await state.client.storage.from('chat-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;
        attachment_url=uploaded.path;attachment_type=file.type.startsWith('video/')?'video':'image';attachment_name=file.name.slice(0,180);
      }
      const {error}=await state.client.from('messages').insert({conversation_id,sender_id:state.session.user.id,body,attachment_url,attachment_type,attachment_name});if(error)throw error;form.reset();await loadChatMessages(conversation_id);
    }
    catch(e){notice('Mensagem não enviada: '+e.message,'error');}
    finally{if(submit)submit.disabled=false;}
  }
  async function renderNotificationsPage() {
    const {data,error}=await state.client.from('notifications').select('id,kind,created_at,read_at,actor_id,profiles!notifications_actor_id_fkey(username,display_name,avatar_url)').eq('recipient_id',state.session.user.id).order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    const notificationRows=(data||[]).map(n=>'<article class="notification-row '+(n.read_at?'':'unread')+'">'+avatar(n.profiles||{})+'<div><strong>'+esc(n.profiles?.display_name||n.profiles?.username||'TeurChat')+'</strong><p>'+esc(({like:'curtiu sua publicação',comment:'comentou em sua publicação',follow:'começou a seguir você',message:'enviou uma mensagem'}[n.kind]||'interagiu com você'))+'</p><small>'+esc(new Date(n.created_at).toLocaleString('pt-BR'))+'</small></div></article>').join('');
    $('#content').innerHTML='<section class="panel"><div class="section-heading"><div><p class="eyebrow">ATIVIDADE</p><h2>Notificações</h2></div><button class="btn secondary" data-action="notifications-read-all">Marcar lidas</button></div>'+(notificationRows||'<p class="muted">Você ainda não tem notificações.</p>')+'</section>';
    const unread=(data||[]).filter(n=>!n.read_at).map(n=>n.id);if(unread.length)await state.client.from('notifications').update({read_at:new Date().toISOString()}).in('id',unread);
  }
  async function openFollowList(userId,kind) {
    const column=kind==='followers'?'follower_id':'followed_id',filter=kind==='followers'?'followed_id':'follower_id';
    const {data,error}=await state.client.from('follows').select('follower_id,followed_id').eq(filter,userId).order('created_at',{ascending:false}).limit(200);
    if(error)throw error;
    const ids=(data||[]).map(x=>x[column]).filter(Boolean);
    let people=[];
    if(ids.length){const result=await state.client.from('profiles').select('id,username,display_name,avatar_url').in('id',ids);if(result.error)throw result.error;people=result.data||[];}
    $('#content').innerHTML='<button class="btn secondary" data-action="back-profile">← Voltar ao perfil</button><section class="panel"><h2>'+(kind==='followers'?'Seguidores':'Seguindo')+'</h2><div class="people-list">'+people.map(p=>'<article class="person-row">'+avatar(p)+'<div class="person-copy"><strong>'+esc(p.display_name||p.username)+'</strong><span>@'+esc(p.username)+'</span></div><button class="btn secondary" data-action="view-profile" data-id="'+esc(p.id)+'">Perfil</button></article>').join('')+'</div>'+(people.length?'':'<p class="muted">Esta lista ainda está vazia.</p>')+'</section>';
  }

  async function renderSupportPage() {
    if(!authRequired()){go('home');return;}
    $('#content').innerHTML='<section class="panel"><p class="eyebrow">ATENDIMENTO TEURCHAT</p><h2>Central de ajuda</h2><p class="muted">Suporte, denúncias, problemas técnicos e recursos de moderação.</p><form id="caseForm"><label>Categoria<select name="category" required><option value="support">Suporte geral</option><option value="report">Denúncia de usuário ou conteúdo</option><option value="bug">Problema técnico</option><option value="appeal">Recurso de moderação</option></select></label><label>Assunto<input name="subject" required minlength="3" maxlength="120"></label><label>Detalhes<textarea name="message" required minlength="10" maxlength="4000" rows="5" placeholder="Explique a situação. Não envie senhas ou dados financeiros."></textarea></label><label>Usuário relacionado (opcional)<input name="target_username" maxlength="24" placeholder="@usuario"></label><label>Link relacionado (opcional)<input name="target_url" type="url" maxlength="1000"></label><button class="btn primary" type="submit" data-busy>Enviar chamado</button></form></section><section class="panel"><h3>Meus chamados</h3><button class="btn secondary" data-action="support-refresh">Atualizar</button><div id="myCases">Carregando…</div></section>';
    await loadMyCases();
  }
  async function loadMyCases() {
    const box=$('#myCases');if(!box||!state.session?.user)return;
    const {data,error}=await state.client.from('community_cases').select('id,category,subject,message,status,resolution,created_at').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    box.innerHTML=(data||[]).length?data.map(c=>'<article class="case-card"><strong>'+esc(c.subject)+'</strong><p class="muted small">'+esc(({support:'Suporte',report:'Denúncia',bug:'Bug',appeal:'Recurso'}[c.category]||c.category))+' · '+esc(({open:'Aberto',in_progress:'Em andamento',waiting_user:'Aguardando você',resolved:'Resolvido',closed:'Encerrado'}[c.status]||c.status))+'</p><p>'+esc(c.message)+'</p>'+(c.resolution?'<p><strong>Resposta da equipe:</strong> '+esc(c.resolution)+'</p>':'')+'</article>').join(''):'<p class="muted">Você ainda não abriu chamados.</p>';
  }
  async function submitCase(form) {
    if(!authRequired())return;const fd=new FormData(form);setBusy(true);
    try{const {data,error}=await state.client.rpc('submit_community_case',{case_category:String(fd.get('category')),case_subject:String(fd.get('subject')).trim(),case_message:String(fd.get('message')).trim(),case_target_username:String(fd.get('target_username')||'').trim().replace(/^@/,'')||null,case_target_url:String(fd.get('target_url')||'').trim()||null});if(error)throw error;form.reset();notice('Chamado enviado. Protocolo: '+String(data).slice(0,8).toUpperCase(),'success');await loadMyCases();}
    catch(e){notice(e.message||'Não foi possível enviar o chamado.','error');}finally{setBusy(false);}
  }
  async function renderAdminPage() {
    if (!state.isAdmin) throw new Error('Acesso restrito à administração.');
    $('#content').innerHTML = '<section class="admin-hero"><div><p class="eyebrow">CENTRO DE CONTROLE</p><h2>Administração do TeurChat</h2><p>Gestão de comunidade, moderação, suporte, relatórios e auditoria.</p></div><span class="admin-shield">' + svgIcon('shield-check') + '</span></section><section class="admin-stat-grid" id="adminStats"><div class="loading">Atualizando indicadores…</div></section><section class="panel admin-tools"><div class="section-heading"><div><p class="eyebrow">ATALHOS DE OPERAÇÃO</p><h3>Ferramentas administrativas</h3><p class="muted small">50 ações para revisar, filtrar, atualizar e exportar dados autorizados.</p></div></div><div id="adminQuickActions" class="admin-quick-grid"></div></section><section class="panel admin-tools"><div class="admin-toolbar"><input id="adminSearch" type="search" placeholder="Buscar por nome ou @usuário" aria-label="Buscar usuários"><button class="btn secondary" data-action="admin-refresh">' + svgIcon('refresh') + ' Atualizar</button></div><p class="muted small">Os nomes de usuário são exclusivos. Emblemas são identificadores visuais e não concedem permissões administrativas.</p><div id="adminUsers"><div class="loading"><span class="spinner"></span>Carregando usuários…</div></div></section><section class="panel admin-tools"><div class="section-heading"><div><p class="eyebrow">CENTRAL DE ATENDIMENTO</p><h3>Suporte e denúncias</h3></div><button class="btn secondary" data-action="admin-cases-refresh">Atualizar</button></div><div class="admin-filter-grid"><label>Estado<select id="adminCaseFilter"><option value="all">Todos</option><option value="open">Abertos</option><option value="in_progress">Em andamento</option><option value="waiting_user">Aguardando usuário</option><option value="resolved">Resolvidos</option><option value="closed">Encerrados</option></select></label><label>Categoria<select id="adminCaseCategory"><option value="all">Todas</option><option value="support">Suporte</option><option value="report">Denúncias</option><option value="bug">Bugs</option><option value="appeal">Recursos</option></select></label><label>Prioridade<select id="adminCasePriority"><option value="all">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select></label></div><div id="adminCases">Carregando chamados…</div></section><section class="panel admin-tools"><div class="section-heading"><div><p class="eyebrow">MODERAÇÃO</p><h3>Denúncias da comunidade</h3></div><button class="btn secondary" data-action="admin-reports-refresh">Atualizar</button></div><label>Estado da denúncia<select id="adminReportFilter"><option value="all">Todas</option><option value="pending">Pendentes</option><option value="reviewing">Em análise</option><option value="resolved">Resolvidas</option><option value="dismissed">Arquivadas</option></select></label><div id="adminReports">Carregando denúncias…</div></section><section class="panel admin-tools"><div class="section-heading"><h3>Auditoria administrativa</h3><button class="btn secondary" data-action="admin-audit-refresh">Atualizar</button></div><div id="adminAudit">Carregando registros…</div></section>'
    const {data,error}=await state.client.rpc('admin_list_users');
    if(error) throw error;
    state.adminUsers=data||[];
    renderAdminUsers();
    await Promise.all([loadAdminCases(),loadAdminAudit(),loadAdminStats(),loadAdminReports()]);
    renderAdminQuickActions();
  }

  async function loadAdminStats(){
    const {data,error}=await state.client.rpc('admin_dashboard_stats');if(error)throw error;state.adminStats=data||{};
    const labels=[['users','Contas'],['posts','Publicações'],['messages','Mensagens'],['followers','Seguimentos'],['comments','Comentários'],['likes','Curtidas'],['reports_open','Denúncias abertas'],['cases_open','Chamados abertos'],['banned','Contas banidas'],['notifications','Notificações']];
    const box=$('#adminStats');if(box)box.innerHTML=labels.map(([k,label])=>'<article class="admin-stat"><span>'+esc(label)+'</span><strong>'+Number(state.adminStats[k]||0).toLocaleString('pt-BR')+'</strong></article>').join('');
  }
  async function loadAdminReports(){
    if(!state.isAdmin)throw new Error('Acesso restrito à administração.');
    const status=$('#adminReportFilter')?.value||'all';const {data,error}=await state.client.rpc('admin_list_reports',{filter_report_status:status});if(error)throw error;state.adminReports=data||[];
    const out=$('#adminReports');if(!out)return;
    out.innerHTML=state.adminReports.length?state.adminReports.map(r=>'<article class="case-card"><div class="section-heading"><span class="case-category">'+esc(({spam:'Spam',harassment:'Assédio',nudity:'Nudez',violence:'Violência',scam:'Golpe',other:'Outro'}[r.reason]||r.reason))+'</span><span class="case-status">'+esc(({pending:'Pendente',reviewing:'Em análise',resolved:'Resolvida',dismissed:'Arquivada'}[r.status]||r.status))+'</span></div><p class="muted small">Denunciante @'+esc(r.reporter_username||'conta indisponível')+' · '+esc(new Date(r.created_at).toLocaleString('pt-BR'))+'</p><p>'+esc(r.details||'Sem detalhes adicionais.')+'</p>'+(r.reported_username?'<p>Usuário denunciado: @'+esc(r.reported_username)+'</p>':'')+(r.post_id?'<p class="muted small">Publicação: '+esc(r.post_id)+'</p>':'')+'<div class="case-controls"><label>Atualizar estado<select data-report-status="'+esc(r.id)+'"><option value="pending" '+(r.status==='pending'?'selected':'')+'>Pendente</option><option value="reviewing" '+(r.status==='reviewing'?'selected':'')+'>Em análise</option><option value="resolved" '+(r.status==='resolved'?'selected':'')+'>Resolvida</option><option value="dismissed" '+(r.status==='dismissed'?'selected':'')+'>Arquivada</option></select></label><button class="btn primary" data-action="admin-report-save" data-id="'+esc(r.id)+'">Salvar análise</button></div></article>').join(''):'<p class="muted">Nenhuma denúncia neste filtro.</p>';
  }
  const adminTools=[
    ['Atualizar tudo','refresh-all'],['Buscar conta','focus-user'],['Limpar busca','clear-user-search'],['Exportar contas CSV','export-users'],['Exportar contas ativas','users-active'],['Exportar contas banidas','users-banned'],['Atualizar chamados','cases-refresh'],['Todos os chamados','cases-all'],['Chamados abertos','cases-open'],['Em andamento','cases-progress'],
    ['Aguardando usuário','cases-waiting'],['Chamados resolvidos','cases-resolved'],['Chamados encerrados','cases-closed'],['Exportar chamados CSV','export-cases'],['Atualizar denúncias','reports-refresh'],['Denúncias pendentes','reports-pending'],['Denúncias em análise','reports-reviewing'],['Denúncias resolvidas','reports-resolved'],['Denúncias arquivadas','reports-dismissed'],['Exportar denúncias CSV','export-reports'],
    ['Chamados de suporte','category-support'],['Fila de bugs','category-bug'],['Fila de recursos','category-appeal'],['Fila de denúncias','category-report'],['Prioridade urgente','priority-urgent'],['Prioridade alta','priority-high'],['Prioridade normal','priority-normal'],['Prioridade baixa','priority-low'],['Atualizar auditoria','audit-refresh'],['Exportar auditoria CSV','export-audit'],
    ['Ver total de contas','stat-users'],['Ver total de publicações','stat-posts'],['Ver total de mensagens','stat-messages'],['Ver total de seguidores','stat-followers'],['Ver total de comentários','stat-comments'],['Ver total de curtidas','stat-likes'],['Ver denúncias abertas','stat-reports'],['Ver chamados abertos','stat-cases'],['Ver contas banidas','stat-banned'],['Ver notificações','stat-notifications'],
    ['Ir para contas','jump-users'],['Ir para chamados','jump-cases'],['Ir para denúncias','jump-reports'],['Ir para auditoria','jump-audit'],['Recarregar contas','reload-users'],['Recarregar chamados','reload-cases'],['Recarregar denúncias','reload-reports'],['Recarregar auditoria','reload-audit'],['Limpar filtros','reset-filters'],['Atualizar indicadores','refresh-stats']
  ];
  function renderAdminQuickActions(){const box=$('#adminQuickActions');if(!box)return;box.innerHTML=adminTools.map(([label,tool],i)=>'<button class="admin-tool-button" data-action="admin-tool" data-tool="'+esc(tool)+'"><span class="tool-index">'+String(i+1).padStart(2,'0')+'</span><span>'+esc(label)+'</span><span class="tool-arrow">↗</span></button>').join('');}
  function exportCsv(name,rows){
    if(!rows?.length){notice('Não há dados para exportar.');return;}
    const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];const csv=[keys.join(','),...rows.map(r=>keys.map(k=>'"'+String(r[k]??'').replace(/"/g,'""').replace(/[\r\n]+/g,' ')+'"').join(','))].join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);notice('Arquivo CSV preparado.','success');
  }
  async function runAdminTool(tool){
    const jump=id=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});
    const setVal=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
    if(tool==='refresh-all'){await renderAdminPage();notice('Painel atualizado.','success');return;}
    if(tool==='focus-user'){jump('adminUsers');$('#adminSearch')?.focus();return;}
    if(tool==='clear-user-search'){setVal('adminSearch','');renderAdminUsers();return;}
    if(tool==='export-users'){exportCsv('teurchat-contas.csv',state.adminUsers);return;}
    if(tool==='users-active'||tool==='users-banned'){setVal('adminSearch','');const rows=state.adminUsers.filter(u=>tool==='users-banned'?u.is_banned:!u.is_banned);exportCsv(tool==='users-banned'?'teurchat-contas-banidas.csv':'teurchat-contas-ativas.csv',rows);return;}
    if(tool.startsWith('cases-')){const v=({'cases-refresh':'all','cases-all':'all','cases-open':'open','cases-progress':'in_progress','cases-waiting':'waiting_user','cases-resolved':'resolved','cases-closed':'closed'}[tool]);if(v!==undefined){setVal('adminCaseFilter',v);setVal('adminCaseCategory','all');setVal('adminCasePriority','all');await loadAdminCases();jump('adminCases');if(tool==='cases-refresh')notice('Chamados atualizados.');return;}}
    if(tool==='export-cases'){exportCsv('teurchat-chamados.csv',state.adminCases);return;}
    if(tool==='reports-refresh'){await loadAdminReports();return;}
    if(tool.startsWith('reports-')){const v=({'reports-pending':'pending','reports-reviewing':'reviewing','reports-resolved':'resolved','reports-dismissed':'dismissed'}[tool]);if(v){setVal('adminReportFilter',v);await loadAdminReports();jump('adminReports');return;}}
    if(tool==='export-reports'){exportCsv('teurchat-denuncias.csv',state.adminReports);return;}
    if(tool.startsWith('category-')){setVal('adminCaseFilter','all');setVal('adminCaseCategory',tool.replace('category-',''));await loadAdminCases();jump('adminCases');return;}
    if(tool.startsWith('priority-')){setVal('adminCasePriority',tool.replace('priority-',''));await loadAdminCases();jump('adminCases');return;}
    if(tool==='audit-refresh'||tool==='reload-audit'){await loadAdminAudit();return;}
    if(tool==='export-audit'){const {data,error}=await state.client.rpc('admin_list_audit',{limit_rows:500});if(error)throw error;exportCsv('teurchat-auditoria.csv',data||[]);return;}
    if(tool.startsWith('stat-')){const key=tool.replace('stat-',''),map={users:'users',posts:'posts',messages:'messages',followers:'followers',comments:'comments',likes:'likes',reports:'reports_open',cases:'cases_open',banned:'banned',notifications:'notifications'};notice(({'users':'Contas','posts':'Publicações','messages':'Mensagens','followers':'Seguimentos','comments':'Comentários','likes':'Curtidas','reports':'Denúncias abertas','cases':'Chamados abertos','banned':'Contas banidas','notifications':'Notificações'}[key])+': '+Number(state.adminStats[map[key]]||0).toLocaleString('pt-BR'));jump('adminStats');return;}
    if(tool.startsWith('jump-')){jump(({ 'jump-users':'adminUsers','jump-cases':'adminCases','jump-reports':'adminReports','jump-audit':'adminAudit'})[tool]);return;}
    if(tool==='reload-users'){const {data,error}=await state.client.rpc('admin_list_users');if(error)throw error;state.adminUsers=data||[];renderAdminUsers();return;}
    if(tool==='reload-cases'){await loadAdminCases();return;}
    if(tool==='reload-reports'){await loadAdminReports();return;}
    if(tool==='reset-filters'){setVal('adminSearch','');setVal('adminCaseFilter','all');setVal('adminCaseCategory','all');setVal('adminCasePriority','all');setVal('adminReportFilter','all');renderAdminUsers();await Promise.all([loadAdminCases(),loadAdminReports()]);notice('Filtros limpos.');return;}
    if(tool==='refresh-stats'){await loadAdminStats();return;}
  }

  async function loadAdminCases() {
    if(!state.isAdmin)throw new Error('Acesso restrito à administração.');
    const {data,error}=await state.client.rpc('admin_list_cases',{filter_status:$('#adminCaseFilter')?.value||'all'});if(error)throw error;
    state.adminCases=data||[];const out=$('#adminCases');if(!out)return;
    const cat=$('#adminCaseCategory')?.value||'all',prio=$('#adminCasePriority')?.value||'all';const visibleCases=state.adminCases.filter(c=>(cat==='all'||c.category===cat)&&(prio==='all'||c.priority===prio));
    out.innerHTML=visibleCases.length?visibleCases.map(c=>'<article class="case-card"><strong>'+esc(c.subject)+'</strong><p class="muted small">'+esc(({support:'Suporte',report:'Denúncia',bug:'Bug',appeal:'Recurso'}[c.category]||c.category))+' · @'+esc(c.username)+' · '+esc(new Date(c.created_at).toLocaleString('pt-BR'))+'</p><p>'+esc(c.message)+'</p>'+(c.target_username?'<p class="muted small">Usuário relacionado: @'+esc(c.target_username)+'</p>':'')+(c.target_url?'<p class="muted small">Link: '+esc(c.target_url)+'</p>':'')+'<div class="case-controls"><label>Status<select data-case-status="'+esc(c.id)+'"><option value="open" '+(c.status==='open'?'selected':'')+'>Aberto</option><option value="in_progress" '+(c.status==='in_progress'?'selected':'')+'>Em andamento</option><option value="waiting_user" '+(c.status==='waiting_user'?'selected':'')+'>Aguardando usuário</option><option value="resolved" '+(c.status==='resolved'?'selected':'')+'>Resolvido</option><option value="closed" '+(c.status==='closed'?'selected':'')+'>Encerrado</option></select></label><label>Prioridade<select data-case-priority="'+esc(c.id)+'"><option value="low" '+(c.priority==='low'?'selected':'')+'>Baixa</option><option value="normal" '+(c.priority==='normal'?'selected':'')+'>Normal</option><option value="high" '+(c.priority==='high'?'selected':'')+'>Alta</option><option value="urgent" '+(c.priority==='urgent'?'selected':'')+'>Urgente</option></select></label><label>Resposta / decisão<textarea data-case-resolution="'+esc(c.id)+'" rows="2" maxlength="4000">'+esc(c.resolution||'')+'</textarea></label><button class="btn primary" data-action="admin-case-save" data-id="'+esc(c.id)+'">Salvar decisão</button></div></article>').join(''):'<p class="muted">Nenhum chamado para este filtro.</p>';
  }
  async function loadAdminAudit() {
    if(!state.isAdmin)throw new Error('Acesso restrito à administração.');
    const {data,error}=await state.client.rpc('admin_list_audit',{limit_rows:50});if(error)throw error;const out=$('#adminAudit');if(!out)return;
    out.innerHTML=(data||[]).length?data.map(x=>'<article class="audit-row"><strong>'+esc(String(x.action).replace(/_/g,' '))+'</strong><p class="muted small">Por @'+esc(x.actor_username||'conta removida')+' · '+esc(x.target_username?'alvo @'+x.target_username:(x.target_case?'chamado '+x.target_case:''))+'</p><p class="muted small">'+esc(JSON.stringify(x.details||{}))+'</p><time>'+esc(new Date(x.created_at).toLocaleString('pt-BR'))+'</time></article>').join(''):'<p class="muted">Nenhuma ação registrada.</p>';
  }
  function renderAdminUsers() {
    const out=$('#adminUsers'); if(!out)return;
    const term=($('#adminSearch')?.value||'').trim().toLowerCase().replace(/^@/,'');
    const users=state.adminUsers.filter(u=>String(u.username||'').toLowerCase().includes(term)||String(u.display_name||'').toLowerCase().includes(term));
    out.innerHTML=users.length?users.map(u=>'<article class="admin-user"><div class="admin-user-main"><span class="avatar">'+esc(initials(u.display_name||u.username))+'</span><div class="admin-user-copy"><strong>'+esc(u.display_name||u.username)+'</strong><span>@'+esc(u.username)+'</span><div class="profile-badges">'+renderBadges(u.badges||[])+'</div>'+(u.is_banned?'<p class="ban-status">'+svgIcon('shield-check')+' Banido · '+esc(u.ban_reason||'Sem motivo informado')+'</p>':'<p class="muted small">Conta ativa</p>')+'</div></div><div class="admin-user-actions"><button class="btn secondary" data-action="admin-badge" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('badge-check')+' Emblema</button><button class="btn secondary" data-action="admin-remove-badge" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('close')+' Remover emblema</button>'+(u.is_banned?'<button class="btn secondary" data-action="admin-unban" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('user')+' Desbanir</button>':'<button class="btn danger" data-action="admin-ban" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('shield-check')+' Banir</button>')+'</div></article>').join(''):'<div class="empty-state"><h3>Nenhum usuário encontrado</h3><p>Tente outro nome ou @usuário.</p></div>';
  }
  async function adminBadge(userId, username) {
    if(!state.isAdmin) throw new Error('Acesso restrito à administração.');
    const choice=prompt('Emblemas oficiais:\\n1 Administrador\\n2 Caçador de Bugs\\n3 Verificado\\n4 Parceiro');
    if(choice===null)return;
    const clean=({'1':'admin','2':'bug_hunter','3':'verified','4':'partner'})[choice.trim()];
    if(!clean)throw new Error('Escolha um emblema oficial.');
    const {error}=await state.client.rpc('admin_set_badge',{target_user:userId,target_badge:clean,should_grant:true});
    if(error)throw error;
    notice('Emblema @'+clean+' atribuído a @'+username+'.','success');
    await renderAdminPage();
  }
  async function adminRemoveBadge(userId, username) {
    if(!state.isAdmin)throw new Error('Acesso restrito à administração.');
    const key=prompt('Emblemas oficiais:\\n1 Administrador\\n2 Caçador de Bugs\\n3 Verificado\\n4 Parceiro');
    if(key===null)return;
    const clean=({'1':'admin','2':'bug_hunter','3':'verified','4':'partner'})[key.trim()];
    if(!clean)throw new Error('Escolha um emblema oficial.');
    const {error}=await state.client.rpc('admin_set_badge',{target_user:userId,target_badge:clean,should_grant:false});
    if(error)throw error;
    notice('Emblema removido de @'+username+'.','success');
    await renderAdminPage();
  }
  async function adminBan(userId, username, shouldBan) {
    if(!state.isAdmin)throw new Error('Acesso restrito à administração.');
    if(shouldBan && !confirm('Confirmar o banimento de @'+username+'? A pessoa continuará podendo ver o site, mas não poderá criar novas interações.'))return;
    const reason=shouldBan?(prompt('Motivo do banimento:','Violação das regras da comunidade')||'Violação das regras da comunidade'):'';
    const {error}=await state.client.rpc('admin_set_ban',{target_user:userId,should_ban:shouldBan,ban_reason:reason,ban_expires_at:null});
    if(error)throw error;
    notice(shouldBan?'@'+username+' foi banido.':'O banimento de @'+username+' foi removido.','success');
    await renderAdminPage();
  }
  async function submitAuth(form) {
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    setBusy(true);
    try {
      const mode = form.dataset.mode || 'login';
      if (mode === 'signup') {
        const username = String(fd.get('username') || '').trim().toLowerCase().replace(/^@/,'');
        const display_name = String(fd.get('display_name') || username).trim() || username;
        if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Use um nome de usuário de 3 a 24 caracteres: letras, números ou _.');
        if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const signup = await state.client.auth.signUp({email,password,options:{data:{username,display_name}, emailRedirectTo: location.origin + '/' }});
        if (signup.error) throw signup.error;
        let session = signup.data.session;
        if (!session) {
          // If email confirmation is disabled, immediately establish a session. If enabled, Supabase requires verification.
          const login = await state.client.auth.signInWithPassword({email,password});
          if (!login.error && login.data.session) session = login.data.session;
          else {
            notice('Conta criada! Para proteger sua conta, confirme o e-mail enviado e depois entre com seus dados.', 'success');
            $('#authTitle').textContent = 'Confirme seu e-mail';
            const hint = $('#authForm .muted.small');
            if (hint) hint.textContent = 'O Supabase exige confirmação de e-mail nesta configuração. Depois de confirmar, entre com o mesmo e-mail e senha.';
            form.dataset.mode = 'login';
            $('#signupFields').hidden = true;
            $('#authSubmit').textContent = 'Entrar';
            $('[data-auth-mode]').forEach(b => b.classList.toggle('active', b.dataset.authMode === 'login'));
            return;
          }
        }
        state.session = session;
        await loadProfile();
        closeModal();
        updateAccountUI();
        go('home');
        notice('Conta criada e sessão iniciada. Bem-vindo ao TeurChat!', 'success');
      } else {
        const login = await state.client.auth.signInWithPassword({email,password});
        if (login.error) throw login.error;
        state.session = login.data.session;
        await loadProfile();
        closeModal();
        updateAccountUI();
        go('home');
        notice('Você entrou no TeurChat.', 'success');
      }
    } catch(e) {
      console.error('Autenticação TeurChat:', e);
      const message = e.message || 'Não foi possível concluir a autenticação.';
      notice(message, 'error');
    } finally { setBusy(false); }
  }
  async function publishPost(form) {
    if (!authRequired()) return;
    const fd = new FormData(form), title = String(fd.get('title') || '').trim(), body = String(fd.get('body') || '').trim(), file = fd.get('media');
    if (!file || !file.size) { notice('Escolha uma foto ou vídeo.', 'error'); return; }
    if (!title || !body) { notice('Preencha o título e a descrição.', 'error'); return; }
    if (file.size > 100 * 1024 * 1024) { notice('O arquivo ultrapassa 100 MB.', 'error'); return; }
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { notice('Envie somente uma foto ou um vídeo.', 'error'); return; }
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g,'') || 'bin';
      const path = state.session.user.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const {data:uploaded,error:uploadError} = await state.client.storage.from('teur-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if (uploadError) throw uploadError;
      const {data:urlData} = state.client.storage.from('teur-media').getPublicUrl(uploaded.path);
      const {error} = await state.client.from('posts').insert({user_id:state.session.user.id,title,body,media_url:urlData.publicUrl,media_type:file.type.startsWith('video/')?'video':'image'});
      if (error) { await state.client.storage.from('teur-media').remove([uploaded.path]); throw error; }
      closeModal();
      state.feed='all';
      state.page = 'home';
      state.viewedProfileId = null;
      document.body.dataset.page = 'home';
      if (location.hash !== '#home') history.replaceState({page:'home'}, '', '#home');
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.go === 'home'));
      $('#pageTitle').textContent = 'Início';
      $('#feedFilters').hidden = false;
      $('#searchBar').hidden = true;
      await renderFeed({silent:true});
      notice('Foto/vídeo publicado com sucesso.','success');
    } catch(e) { console.error(e); notice('Não foi possível publicar: '+(e.message || 'verifique o armazenamento do Supabase.'),'error'); }
    finally { setBusy(false); }
  }
  async function likePost(id) {
    if (!authRequired()) return;
    const p = state.posts.find(x=>x.id===id); if (!p) return;
    const liked = p.likes?.some(x=>x.user_id===state.session.user.id);
    try {
      const result = liked
        ? await state.client.from('likes').delete().eq('user_id',state.session.user.id).eq('post_id',id)
        : await state.client.from('likes').insert({user_id:state.session.user.id,post_id:id});
      if (result.error) throw result.error;
      p.likes = Array.isArray(p.likes) ? p.likes.filter(x => x.user_id !== state.session.user.id) : [];
      if (!liked) p.likes.push({user_id:state.session.user.id});
      const button = $('#content [data-post="'+CSS.escape(id)+'"] [data-action="like"]');
      if (button) {
        button.classList.toggle('selected', !liked);
        button.setAttribute('aria-pressed', String(!liked));
        const count = button.querySelector('b'); if (count) count.textContent = String(p.likes.length);
      }
    } catch(e) { notice('Não foi possível atualizar a curtida: '+e.message,'error'); }
  }
  async function savePost(id) {
    if (!authRequired()) return;
    try {
      const {data:existing,error:readError}=await state.client.from('bookmarks').select('post_id').eq('user_id',state.session.user.id).eq('post_id',id).maybeSingle();
      if(readError) throw readError;
      if(existing) { const {error}=await state.client.from('bookmarks').delete().eq('user_id',state.session.user.id).eq('post_id',id); if(error) throw error; notice('Publicação removida dos salvos.'); }
      else { const {error}=await state.client.from('bookmarks').insert({user_id:state.session.user.id,post_id:id}); if(error) throw error; notice('Publicação salva.','success'); }
      const button = $('#content [data-post="'+CSS.escape(id)+'"] [data-action="save"]');
      if (button) {
        button.classList.toggle('selected', !existing);
        const label = button.querySelector('b'); if (label) label.textContent = existing ? 'Salvar' : 'Salvo';
      }
      if(state.page==='saved' && existing) $('#content [data-post="'+CSS.escape(id)+'"]')?.remove();
    } catch(e) { notice('Não foi possível salvar: '+e.message,'error'); }
  }
  async function submitComment(form) {
    if (!authRequired()) return;
    const body=String(new FormData(form).get('body')||'').trim(), post_id=form.dataset.postId;
    if(!body) return;
    setBusy(true);
    try {
      const {data,error}=await state.client.from('comments').insert({user_id:state.session.user.id,post_id,body}).select('id').single();
      if(error)throw error;
      const post = state.posts.find(x => x.id === post_id);
      if (post) { post.comments = Array.isArray(post.comments) ? post.comments : []; post.comments.push({id:data.id}); }
      const count = $('#content [data-post="'+CSS.escape(post_id)+'"] [data-action="comment"] b');
      if (count && post) count.textContent = String(post.comments.length);
      closeModal(); notice('Comentário enviado.','success');
    }
    catch(e){notice('Não foi possível comentar: '+e.message,'error');}
    finally{setBusy(false);}
  }
  async function editProfile() {
    if (!authRequired()) return;
    try { if (!state.profile) await loadProfile(); } catch (e) { notice('Não foi possível carregar seu perfil: ' + e.message, 'error'); return; }
    const p = state.profile || {};
    $('#modalBody').innerHTML = '<div class="modal-head"><div><p class="eyebrow">SUA CONTA</p><h2>Personalizar perfil</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><form id="profileForm"><div class="banner-editor-preview" style="background-image:' + (p.banner_url ? 'url(&quot;' + esc(p.banner_url) + '&quot;)' : 'linear-gradient(120deg,#343943,#111317)') + '"></div><label>Banner do perfil<input name="banner_file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><p class="muted small">Imagem de até 10 MB, visível no topo do seu perfil.</p><label class="inline-check"><input name="remove_banner" type="checkbox"> Remover banner atual</label><label>Nome exibido<input name="display_name" required maxlength="40" value="' + esc(p.display_name || '') + '"></label><label>Nome de usuário<input name="username" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="' + esc(p.username || '') + '"><span class="muted small">3 a 24 letras, números ou _.</span></label><label>Biografia<textarea name="bio" maxlength="180" rows="3" placeholder="Conte um pouco sobre você…">' + esc(p.bio || '') + '</textarea><span class="muted small">Conte seus interesses para as pessoas conhecerem você.</span></label><label>URL da foto de perfil<input name="avatar_url" type="url" maxlength="500" placeholder="https://…" value="' + esc(p.avatar_url || '') + '"></label><p class="muted small">Seu e-mail não aparece no perfil público.</p><button class="btn primary full" type="submit" data-busy>Salvar personalização</button></form>';
    $('#modal').dataset.kind = 'profile';
    $('#modal').classList.add('open');
    $('#modal').setAttribute('aria-hidden','false');
  }
  async function submitProfile(form) {
    const fd = new FormData(form);
    const display_name = String(fd.get('display_name') || '').trim().slice(0,40);
    const username = String(fd.get('username') || '').trim().toLowerCase().replace(/^@/,'');
    const bio = String(fd.get('bio') || '').trim().slice(0,180);
    const avatar_url = String(fd.get('avatar_url') || '').trim();
    const bannerFile = fd.get('banner_file');
    const removeBanner = fd.get('remove_banner') === 'on';
    let banner_url = state.profile?.banner_url || null;
    if (!display_name) { notice('Informe seu nome de exibição.', 'error'); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) { notice('O nome de usuário deve ter 3 a 24 caracteres: letras, números ou _.', 'error'); return; }
    if (avatar_url && !/^https:\/\//i.test(avatar_url)) { notice('A foto precisa usar um endereço HTTPS.', 'error'); return; }
    if (bannerFile instanceof File && bannerFile.size > 10 * 1024 * 1024) { notice('O banner precisa ter no máximo 10 MB.', 'error'); return; }
    if (bannerFile instanceof File && bannerFile.size && !['image/jpeg','image/png','image/webp','image/gif'].includes(bannerFile.type)) { notice('Use JPG, PNG, WEBP ou GIF.', 'error'); return; }
    setBusy(true);
    try {
      if (removeBanner) banner_url = null;
      if (bannerFile instanceof File && bannerFile.size) {
        const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[bannerFile.type];
        const path = state.session.user.id + '/' + Date.now() + '.' + ext;
        const {error:uploadError} = await state.client.storage.from('profile-banners').upload(path,bannerFile,{upsert:true,contentType:bannerFile.type,cacheControl:'3600'});
        if (uploadError) throw new Error('Falha ao enviar o banner: ' + uploadError.message);
        const {data:publicData} = state.client.storage.from('profile-banners').getPublicUrl(path);
        banner_url = publicData.publicUrl;
      }
      const updates = {display_name, username, bio, avatar_url: avatar_url || null, banner_url};
      const {data,error} = await state.client.from('profiles').update(updates).eq('id',state.session.user.id).select('id,username,display_name,bio,avatar_url,banner_url').single();
      if (error) {
        if (error.code === '23505') throw new Error('Esse nome de usuário já está em uso. Escolha outro.');
        throw error;
      }
      state.profile = data;
      await loadProfile();
      closeModal();
      updateAccountUI();
      await renderPage();
      notice('Perfil atualizado com sucesso.', 'success');
    } catch(e) {
      console.error('Erro ao salvar perfil:', e);
      notice('Não foi possível salvar o perfil: ' + (e.message || 'erro inesperado'), 'error');
    } finally { setBusy(false); }
  }
  async function searchProfiles(term) {
    const out=$('#peopleResults'); if(!term.trim()){out.innerHTML='<p class="muted">Digite um nome de usuário ou nome para buscar.</p>';return;}
    out.innerHTML='<div class="loading">Buscando pessoas…</div>';
    try {
      const clean=term.trim().replace(/^@/,'').replace(/[%_]/g,'');
      const {data,error}=await state.client.from('profiles').select('id,username,display_name,bio').or('username.ilike.%'+clean+'%,display_name.ilike.%'+clean+'%').limit(20);
      if(error)throw error;
      out.innerHTML=data?.length?data.map(p=>'<article class="person-row">'+avatar(p)+'<div class="person-copy"><strong>'+esc(p.display_name)+'</strong><span>@'+esc(p.username)+'</span><p>'+esc(p.bio||'')+'</p></div><button class="btn secondary" data-action="follow" data-id="'+esc(p.id)+'" data-username="'+esc(p.username)+'">Seguir</button></article>').join(''):'<p class="muted">Nenhuma pessoa encontrada.</p>';
    } catch(e) { out.innerHTML='<p class="muted">Busca indisponível: '+esc(e.message)+'</p>'; }
  }
  async function reportContent({postId=null,userId=null,username='usuario'}={}) {
    if(!authRequired())return;
    const reason=prompt('Motivo da denúncia:\n1 Spam\n2 Assédio\n3 Nudez\n4 Violência\n5 Golpe\n6 Outro');if(reason===null)return;
    const key=({'1':'spam','2':'harassment','3':'nudity','4':'violence','5':'scam','6':'other'})[reason.trim()];if(!key){notice('Escolha um motivo entre 1 e 6.','error');return;}
    const details=(prompt('Conte brevemente o que aconteceu (opcional):','')||'').trim().slice(0,1000);
    const payload={reporter_id:state.session.user.id,reported_user_id:userId,post_id:postId,reason:key,details};
    const {error}=await state.client.from('reports').insert(payload);if(error)throw error;notice('Denúncia enviada à equipe de moderação.','success');
  }
  async function followUser(id, username) {
    if(!authRequired())return;
    if(id===state.session.user.id){notice('Esse é o seu próprio perfil.');return;}
    try{
      const {data:existing,error:r}=await state.client.from('follows').select('followed_id').eq('follower_id',state.session.user.id).eq('followed_id',id).maybeSingle();if(r)throw r;
      if(existing){const {error}=await state.client.from('follows').delete().eq('follower_id',state.session.user.id).eq('followed_id',id);if(error)throw error;notice('Você deixou de seguir @'+username+'.');}
      else{const {error}=await state.client.from('follows').insert({follower_id:state.session.user.id,followed_id:id});if(error)throw error;notice('Agora você segue @'+username+'.','success');}
      if(state.page==='profile'&&state.viewedProfileId===id) await openUserProfile(id); else await searchProfiles($('#peopleSearch')?.value||username);
    }catch(e){notice('Não foi possível atualizar o seguimento: '+e.message,'error');}
  }
  async function handleAction(action, el) {
    const id=el.dataset.id;
    if(action==='admin-panel') { if(!state.isAdmin)throw new Error('Acesso restrito à administração.'); go('admin'); return; }
    if(action==='admin-refresh') return renderAdminPage();
    if(action==='admin-cases-refresh') return loadAdminCases();
    if(action==='admin-audit-refresh') return loadAdminAudit();
    if(action==='admin-reports-refresh') return loadAdminReports();
    if(action==='admin-report-save'){if(!state.isAdmin)throw new Error('Acesso restrito à administração.');const status=$('[data-report-status="'+CSS.escape(id)+'"]')?.value||'pending';const {error}=await state.client.rpc('admin_update_report',{target_report:id,new_report_status:status});if(error)throw error;notice('Análise da denúncia salva e auditada.','success');await Promise.all([loadAdminReports(),loadAdminAudit(),loadAdminStats()]);return;}
    if(action==='admin-tool') return runAdminTool(el.dataset.tool);
    if(action==='admin-case-save') { if(!state.isAdmin)throw new Error('Acesso restrito à administração.'); const status=$('[data-case-status="'+CSS.escape(id)+'"]')?.value||'open'; const priority=$('[data-case-priority="'+CSS.escape(id)+'"]')?.value||'normal'; const resolution=$('[data-case-resolution="'+CSS.escape(id)+'"]')?.value||''; const {error}=await state.client.rpc('admin_update_case',{target_case:id,new_status:status,new_priority:priority,case_resolution:resolution,assign_to_self:true});if(error)throw error;notice('Chamado atualizado e decisão registrada.','success');await loadAdminCases();await loadAdminAudit();return; }
    if(action==='support-refresh') return loadMyCases();
    if(action==='chat-refresh') return loadChatList();
    if(action==='open-chat') return openConversation(id);
    if(action==='start-chat') return startChat(id,el.dataset.username||'usuario');
    if(action==='open-follow-list') return openFollowList(id,el.dataset.kind||'followers');
    if(action==='back-profile') { if(state.viewedProfileId) return openUserProfile(state.viewedProfileId); return go('profile'); }
    if(action==='notifications-read-all') { const {error}=await state.client.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',state.session.user.id).is('read_at',null);if(error)throw error;return renderNotificationsPage(); }
    if(action==='admin-badge') return adminBadge(id,el.dataset.username);
    if(action==='admin-remove-badge') return adminRemoveBadge(id,el.dataset.username);
    if(action==='admin-delete-comment') { if(!state.isAdmin)throw new Error('Acesso restrito à administração.'); if(!confirm('Excluir este comentário?'))return; const {error}=await state.client.rpc('admin_delete_comment',{target_comment:id}); if(error)throw error; notice('Comentário removido.','success'); const postId=$('#commentForm')?.dataset.postId; if(postId) await loadComments(postId); await renderPage(); return; }
    if(action==='admin-ban') return adminBan(id,el.dataset.username,true);
    if(action==='admin-unban') return adminBan(id,el.dataset.username,false);
    if(action==='compose') return openModal('compose');
    if(action==='close-modal') return closeModal();
    if(action==='auth') return openModal('auth');
    if(action==='refresh') return renderPage();
    if(action==='like') return likePost(id);
    if(action==='save') return savePost(id);
    if(action==='comment') return openModal('comment',{postId:id});
    if(action==='view-profile') { try { await openUserProfile(id); } catch(e) { notice('Não foi possível abrir o perfil: '+e.message,'error'); } return; }
    if(action==='back-feed') { state.viewedProfileId=null; go('home'); return; }
    if(action==='share') { const url=location.origin+'/#post-'+id; try{if(navigator.share)await navigator.share({title:'TeurChat',url});else{await navigator.clipboard.writeText(url);notice('Link copiado.','success');}}catch(e){if(e.name!=='AbortError')notice('Não foi possível compartilhar este link.');} return; }
    if(action==='post-more') { const p=state.posts.find(x=>x.id===id); if(!p)return; if(state.isAdmin){if(!confirm('Excluir esta publicação de @'+(p.profiles?.username||'usuário')+'? Esta ação não pode ser desfeita.'))return; const {error}=await state.client.rpc('admin_delete_post',{target_post:id});if(error)throw error;notice('Publicação removida pela administração.','success');await renderPage();}else if(p.user_id===state.session?.user?.id){if(confirm('Excluir esta publicação? Esta ação não pode ser desfeita.')){const {error}=await state.client.from('posts').delete().eq('id',id).eq('user_id',state.session.user.id);if(error)notice(error.message,'error');else{notice('Publicação excluída.','success');await renderPage();}}}else return reportContent({postId:id,userId:p.user_id,username:p.profiles?.username||'usuario'}); return; }
    if(action==='report-user') return reportContent({userId:id,username:el.dataset.username||'usuario'});
    if(action==='signout') { const {error}=await state.client.auth.signOut(); if(error)notice(error.message,'error');else{state.session=null;state.profile=null;updateAccountUI();go('home');notice('Você saiu da conta.');} return; }
    if(action==='edit-profile') return editProfile();
    if(action==='follow') return followUser(el.dataset.id,el.dataset.username);
    if(action==='people-search') return searchProfiles($('#peopleSearch')?.value||'');
    if(action==='open-people') { $('#content').innerHTML='<section class="panel"><h2>Encontrar pessoas</h2><form id="peopleSearchForm" class="search-form"><input id="peopleSearch" placeholder="Nome ou @usuário" autocomplete="off"><button class="btn primary" type="submit">Buscar</button></form><div id="peopleResults"><p class="muted">Pesquise para encontrar pessoas da comunidade.</p></div></section>'; return; }
  }
  document.addEventListener('input', e => { if(e.target?.id==='adminSearch') renderAdminUsers(); });
  document.addEventListener('change',async e=>{if(['adminCaseFilter','adminCaseCategory','adminCasePriority'].includes(e.target?.id)){try{await loadAdminCases()}catch(err){notice(err.message||'Falha ao filtrar chamados.','error')}}if(e.target?.id==='adminReportFilter'){try{await loadAdminReports()}catch(err){notice(err.message||'Falha ao filtrar denúncias.','error')}}});
  document.addEventListener('click', async e => {
    const target=e.target instanceof Element?e.target:null; if(!target)return;
    const nav=target.closest('[data-go]'); if(nav){e.preventDefault();go(nav.dataset.go);return;}
    const act=target.closest('[data-action]');if(act){e.preventDefault();try{await handleAction(act.dataset.action,act);}catch(err){console.error(err);notice(err.message||'A ação falhou.','error');}return;}
    const feed=target.closest('[data-feed-mode]');if(feed){state.feed=feed.dataset.feedMode;$$('[data-feed-mode]').forEach(b=>b.classList.toggle('active',b===feed));await renderFeed().catch(err=>notice(err.message,'error'));return;}
    const mode=target.closest('[data-auth-mode]');if(mode){const form=$('#authForm');form.dataset.mode=mode.dataset.authMode;$('#authTitle').textContent=mode.dataset.authMode==='signup'?'Crie sua conta':'Entre na sua conta';$('#signupFields').hidden=mode.dataset.authMode!=='signup';$('#authSubmit').textContent=mode.dataset.authMode==='signup'?'Criar conta':'Entrar';$$('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b===mode));return;}
    if(target.id==='modal'){closeModal();}
  });
  document.addEventListener('change', e => {
    if (e.target?.name !== 'banner_file') return;
    const file = e.target.files?.[0];
    const preview = document.querySelector('.banner-editor-preview');
    if (!file || !preview) return;
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) { notice('Use JPG, PNG, WEBP ou GIF.', 'error'); e.target.value=''; return; }
    if (file.size > 10 * 1024 * 1024) { notice('O banner precisa ter no máximo 10 MB.', 'error'); e.target.value=''; return; }
    const reader = new FileReader();
    reader.onload = () => { preview.style.backgroundImage = 'url("' + String(reader.result).replace(/"/g,'') + '")'; };
    reader.readAsDataURL(file);
  });
  document.addEventListener('submit', async e => {
    const form=e.target;if(!(form instanceof HTMLFormElement))return;
    if(form.id==='authForm'){e.preventDefault();form.dataset.mode=form.dataset.mode||'login';await submitAuth(form);}
    if(form.id==='postForm'){e.preventDefault();await publishPost(form);}
    if(form.id==='commentForm'){e.preventDefault();await submitComment(form);}
    if(form.id==='profileForm'){e.preventDefault();await submitProfile(form);}
    if(form.id==='caseForm'){e.preventDefault();await submitCase(form);}
    if(form.id==='messageForm'){e.preventDefault();await sendMessage(form);}
    if(form.id==='chatSearchForm'){e.preventDefault();await searchChatPeople($('#chatSearch').value);}
    if(form.id==='searchForm'){e.preventDefault();state.search=$('#searchInput').value.trim();state.page='explore';go('explore');}
    if(form.id==='peopleSearchForm'){e.preventDefault();await searchProfiles($('#peopleSearch').value);}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  async function init() {
    updateAccountUI();
    const shared = /^#post-([0-9a-f-]{36})$/i.exec(location.hash || '');
    try {
      await ensureClient();
      if (state.page !== 'home') await go(state.page, false);
      else await renderPage();
      if (shared) await openSharedPost(shared[1]);
    }
    catch(e) {
      console.error('TeurChat initialization:',e);
      $('#content').innerHTML='<section class="empty-state"><div class="empty-mark">!</div><h2>O TeurChat não conseguiu conectar</h2><p>'+esc(e.message||'Verifique a conexão.')+'</p><button class="btn primary" data-action="refresh">Tentar novamente</button></section>';
      notice('Falha na inicialização. Veja a mensagem na tela.','error');
    }
  }
  window.TeurChatApp={go,renderPage,refresh:()=>renderPage(),openAuth:()=>openModal('auth')};
  // Restore an internal destination without forcing a browser navigation/reload.
  const initialRoute = (location.hash || '#home').slice(1);
  if (['home','explore','saved','messages','profile','notifications','admin','support'].includes(initialRoute)) state.page = initialRoute;
  init();
})();
