(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { client: null, session: null, profile: null, page: 'home', feed: 'all', posts: [], search: '', busy: false, badges: [], viewedProfileId: null, isAdmin: false, adminUsers: [] };
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
  function go(page) {
    const allowed = ['home','explore','saved','messages','profile','notifications','admin'];
    state.page = allowed.includes(page) ? page : 'home';
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.go === state.page));
    $('#pageTitle').textContent = ({home:'Início',explore:'Explorar',saved:'Salvos',messages:'Mensagens',profile:'Meu perfil',notifications:'Notificações',admin:'Administração'})[state.page];
    const adminNav = $('#adminNav'); if (adminNav) adminNav.hidden = !state.isAdmin;
    renderPage().catch(e => { console.error(e); notice('Não foi possível abrir esta área: ' + (e.message || 'erro')); });
  }
  function openModal(kind, extra = {}) {
    const modal = $('#modal'); if (!modal) return;
    modal.dataset.kind = kind; modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
    const body = $('#modalBody');
    if (kind === 'auth') {
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">BEM-VINDO AO TEURCHAT</p><h2 id="authTitle">Entre na sua conta</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><div class="auth-switch"><button class="switch active" data-auth-mode="login">Entrar</button><button class="switch" data-auth-mode="signup">Criar conta</button></div><form id="authForm"><label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="voce@email.com"></label><label>Senha<input name="password" type="password" minlength="6" autocomplete="current-password" required placeholder="Mínimo de 6 caracteres"></label><div id="signupFields" hidden><label>Nome de usuário<input name="username" autocomplete="username" minlength="3" maxlength="24" placeholder="seunome"></label><label>Como quer ser chamado?<input name="display_name" maxlength="40" placeholder="Seu nome"></label></div><button class="btn primary full" data-busy type="submit" id="authSubmit">Entrar</button><p class="muted small">Sua conta é protegida pelo Supabase do TeurChat.</p></form>';
    } else if (kind === 'compose') {
      if (!authRequired()) return;
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">COMPARTILHE COM A COMUNIDADE</p><h2>Nova publicação</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><form id="postForm"><label>Foto ou vídeo<input name="media" type="file" accept="image/*,video/mp4,video/webm,video/quicktime" required></label><p class="muted small">Até 100 MB por arquivo.</p><label>Título<input name="title" required maxlength="100" placeholder="Título da publicação"></label><label>Descrição<textarea name="body" required maxlength="1200" rows="4" placeholder="Descreva sua foto ou vídeo..."></textarea></label><div class="form-foot"><span class="muted small">Título até 100 caracteres</span><button class="btn primary" type="submit" data-busy>Publicar ↗</button></div></form>';
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
  }
  async function loadProfile() {
    const user = state.session?.user;
    if (!user) { state.profile = null; state.badges = []; state.isAdmin = false; const adminNav = $('#adminNav'); if (adminNav) adminNav.hidden = true; return; }
    const columns = 'id,username,display_name,bio,avatar_url';
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
  const avatar = p => '<span class="avatar">' + (p?.avatar_url && /^https:\/\//i.test(p.avatar_url) ? '<img src="' + esc(p.avatar_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : esc(initials(p?.display_name || p?.username || 'U'))) + '</span>';
  const badgeMeta = {
    admin: { label: 'Administrador', icon: 'shield-check' },
    bug_hunter: { label: 'Caçador de Bugs', icon: 'bug' },
    verified: { label: 'Verificado', icon: 'badge-check' }
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
      'external-link': '<path d="M14 3h7v7M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
    };
    return '<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.user) + '</svg>';
  }
  function renderPost(p) {
    const profile = p.profiles || {};
    const liked = Array.isArray(p.likes) && p.likes.some(x => x.user_id === state.session?.user?.id);
    const likes = p.likes?.length || 0, comments = p.comments?.length || 0;
    const type = p.media_type || (/\.(mp4|webm|mov)(\?|$)/i.test(p.media_url || '') ? 'video' : 'image');
    const media = p.media_url ? (type === 'video' ? '<video class="post-media" src="' + esc(p.media_url) + '" controls playsinline preload="metadata"></video>' : '<img class="post-media" src="' + esc(p.media_url) + '" alt="' + esc(p.title || 'Foto da publicação') + '" loading="lazy">') : '';
    return '<article class="post-card" data-post="' + esc(p.id) + '"><div class="post-top"><button class="avatar-button" data-action="view-profile" data-id="' + esc(p.user_id) + '" aria-label="Ver perfil">' + avatar(profile) + '</button><button class="post-author profile-open" data-action="view-profile" data-id="' + esc(p.user_id) + '"><strong>' + esc(profile.display_name || profile.username || 'Usuário TeurChat') + '</strong><span>@' + esc(profile.username || 'usuario') + ' · ' + esc(new Date(p.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})) + '</span></button><button class="icon-btn post-more" data-action="post-more" data-id="' + esc(p.id) + '" aria-label="Mais opções">' + svgIcon('more') + '</button></div>' + (p.title ? '<h3 class="post-title">' + esc(p.title) + '</h3>' : '') + media + '<div class="post-body">' + esc(p.body) + '</div><div class="post-actions"><button class="action ' + (liked?'selected':'') + '" data-action="like" data-id="' + esc(p.id) + '"><span>' + svgIcon('heart') + '</span> ' + likes + '</button><button class="action" data-action="comment" data-id="' + esc(p.id) + '"><span>' + svgIcon('comment') + '</span> ' + comments + ' comentários</button><button class="action" data-action="save" data-id="' + esc(p.id) + '"><span>' + svgIcon('bookmark') + '</span> Salvar</button><button class="action share-action" data-action="share" data-id="' + esc(p.id) + '"><span>' + svgIcon('share') + '</span> Compartilhar</button></div></article>';
  }
  async function loadComments(postId) {
    const box = $('#commentList'); if (!box) return;
    const {data,error} = await state.client.from('comments').select('id,body,created_at,user_id,profiles!comments_user_id_fkey(username,display_name,avatar_url)').eq('post_id',postId).order('created_at',{ascending:true}).limit(100);
    if (error) throw error;
    box.innerHTML = data?.length ? data.map(x => '<article class="comment-row">' + avatar(x.profiles || {}) + '<div><strong>' + esc(x.profiles?.display_name || x.profiles?.username || 'Usuário') + ' <span>@' + esc(x.profiles?.username || 'usuario') + '</span></strong><p>' + esc(x.body) + '</p><small>' + esc(new Date(x.created_at).toLocaleString('pt-BR')) + '</small></div></article>').join('') : '<p class="muted">Ainda não há comentários. Seja a primeira pessoa a comentar.</p>';
  }
  async function openUserProfile(userId) {
    const {data:p,error} = await state.client.from('profiles').select('id,username,display_name,bio,avatar_url').eq('id',userId).single();
    if (error) throw error;
    const {data:userBadgeRows} = await state.client.from('profile_badges').select('badge_key').eq('user_id',userId);
    const publicBadges=(userBadgeRows||[]).map(row=>row.badge_key);
    const {data:posts,error:postError} = await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url),likes(user_id),comments(id)').eq('user_id',userId).order('created_at',{ascending:false}).limit(40);
    if (postError) throw postError;
    state.posts = posts || []; state.viewedProfileId = userId;
    $('#feedFilters').hidden = true; $('#searchBar').hidden = true; $('#pageTitle').textContent = '@' + (p.username || 'perfil');
    const own = userId === state.session?.user?.id;
    $('#content').innerHTML = '<button class="btn secondary" data-action="back-feed">← Voltar ao feed</button><section class="profile-card"><div class="profile-cover"></div><div class="profile-info">' + avatar(p) + '<h2>' + esc(p.display_name || p.username) + '</h2><p>@' + esc(p.username) + '</p><div class="profile-badges">' + renderBadges(publicBadges) + '</div><p>' + esc(p.bio || '') + '</p>' + (own ? '<button class="btn secondary" data-action="edit-profile">Editar perfil</button>' : '<button class="btn secondary" data-action="follow" data-id="' + esc(p.id) + '" data-username="' + esc(p.username) + '">Seguir / deixar de seguir</button>') + '</div></section><section class="panel"><h3>Publicações de @' + esc(p.username) + '</h3><div id="userPosts">' + (state.posts.length ? state.posts.map(renderPost).join('') : '<p class="muted">Este perfil ainda não publicou fotos ou vídeos.</p>') + '</div></section>';
  }  async function fetchPosts() {
    let query = state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url),likes(user_id),comments(id)').order('created_at',{ascending:false}).limit(40);
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
  async function renderFeed() {
    const target = $('#content');
    target.innerHTML = '<div class="loading"><span class="spinner"></span><span>Carregando publicações…</span></div>';
    try {
      state.posts = await fetchPosts();
      if (!state.posts.length) {
        target.innerHTML = '<section class="empty-state"><div class="empty-mark">' + svgIcon('plus') + '</div><h2>' + (state.page==='explore'?'Nada encontrado por enquanto':'Sua comunidade começa aqui') + '</h2><p>' + (state.page==='explore'?'Tente outra busca ou volte mais tarde.':'Ainda não há publicações para mostrar. Seja a primeira pessoa a compartilhar algo.') + '</p><button class="btn primary" data-action="compose">Criar publicação</button></section>';
        return;
      }
      target.innerHTML = state.posts.map(renderPost).join('');
    } catch (e) {
      console.error(e);
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
        const {data:posts,error:e} = await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url),likes(user_id),comments(id)').in('id',ids).order('created_at',{ascending:false});
        if (e) throw e; state.posts=posts||[]; $('#content').innerHTML=state.posts.map(renderPost).join(''); return;
      }
      await renderFeed(); return;
    }
    $('#feedFilters').hidden = true; $('#searchBar').hidden = true;
    if (state.page === 'profile') {
      if (!authRequired()) { go('home'); return; }
      const p = state.profile || {};
      $('#content').innerHTML = '<section class="profile-card"><div class="profile-cover"></div><div class="profile-info">' + avatar(p) + '<h2>' + esc(p.display_name || 'Meu perfil') + '</h2><p>@' + esc(p.username || 'usuario') + '</p><div class="profile-badges">' + renderBadges(state.badges) + '</div><p>' + esc(p.bio || 'Adicione uma descrição ao seu perfil.') + '</p><button class="btn secondary" data-action="edit-profile">' + svgIcon('user') + ' Editar perfil</button>' + (state.isAdmin ? '<button class="btn primary" data-action="admin-panel">' + svgIcon('shield-check') + ' Painel administrativo</button>' : '') + '<button class="btn secondary" data-action="signout">Sair da conta</button></div></section><section class="panel"><h3>Minhas publicações</h3><div id="myPosts"><div class="loading">Carregando…</div></div></section>';
      const {data,error}=await state.client.from('posts').select('id,user_id,title,body,media_url,media_type,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url),likes(user_id),comments(id)').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(30);
      if(error) throw error; $('#myPosts').innerHTML=data?.length?data.map(renderPost).join(''):'<p class="muted">Você ainda não publicou nada.</p>'; return;
    }
    if (state.page === 'admin') { if (!state.isAdmin) { notice('Esta área é exclusiva da administração.', 'error'); go('home'); return; } await renderAdminPage(); return; }
    if (state.page === 'messages') {
      if (!authRequired()) { go('home'); return; }
      $('#content').innerHTML = '<section class="empty-state"><div class="empty-mark">' + svgIcon('message') + '</div><h2>Suas conversas</h2><p>Para começar, encontre uma pessoa em Explorar e abra o perfil dela. A área de mensagens depende das permissões de conversas do banco.</p><button class="btn primary" data-go="explore">Encontrar pessoas</button></section>'; return;
    }
    if (state.page === 'notifications') {
      if (!authRequired()) { go('home'); return; }
      $('#content').innerHTML = '<section class="empty-state"><div class="empty-mark">' + svgIcon('bell') + '</div><h2>Notificações</h2><p>Você verá novidades da sua conta aqui quando houver notificações disponíveis.</p><button class="btn secondary" data-action="refresh">Atualizar</button></section>'; return;
    }
  }
  async function renderAdminPage() {
    if (!state.isAdmin) throw new Error('Acesso restrito à administração.');
    $('#content').innerHTML = '<section class="admin-hero"><div><p class="eyebrow">CENTRO DE CONTROLE</p><h2>Administração do TeurChat</h2><p>Gerencie a comunidade, atribua emblemas personalizados e aplique ou remova banimentos.</p></div><span class="admin-shield">' + svgIcon('shield-check') + '</span></section><section class="panel admin-tools"><div class="admin-toolbar"><input id="adminSearch" type="search" placeholder="Buscar por nome ou @usuário" aria-label="Buscar usuários"><button class="btn secondary" data-action="admin-refresh">' + svgIcon('refresh') + ' Atualizar</button></div><p class="muted small">Os nomes de usuário são exclusivos. Emblemas são identificadores visuais e não concedem permissões administrativas.</p><div id="adminUsers"><div class="loading"><span class="spinner"></span>Carregando usuários…</div></div></section>';
    const {data,error}=await state.client.rpc('admin_list_users');
    if(error) throw error;
    state.adminUsers=data||[];
    renderAdminUsers();
  }
  function renderAdminUsers() {
    const out=$('#adminUsers'); if(!out)return;
    const term=($('#adminSearch')?.value||'').trim().toLowerCase().replace(/^@/,'');
    const users=state.adminUsers.filter(u=>String(u.username||'').toLowerCase().includes(term)||String(u.display_name||'').toLowerCase().includes(term));
    out.innerHTML=users.length?users.map(u=>'<article class="admin-user"><div class="admin-user-main"><span class="avatar">'+esc(initials(u.display_name||u.username))+'</span><div class="admin-user-copy"><strong>'+esc(u.display_name||u.username)+'</strong><span>@'+esc(u.username)+'</span><div class="profile-badges">'+renderBadges(u.badges||[])+'</div>'+(u.is_banned?'<p class="ban-status">'+svgIcon('shield-check')+' Banido · '+esc(u.ban_reason||'Sem motivo informado')+'</p>':'<p class="muted small">Conta ativa</p>')+'</div></div><div class="admin-user-actions"><button class="btn secondary" data-action="admin-badge" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('badge-check')+' Emblema</button><button class="btn secondary" data-action="admin-remove-badge" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('close')+' Remover emblema</button>'+(u.is_banned?'<button class="btn secondary" data-action="admin-unban" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('user')+' Desbanir</button>':'<button class="btn danger" data-action="admin-ban" data-id="'+esc(u.id)+'" data-username="'+esc(u.username)+'">'+svgIcon('shield-check')+' Banir</button>')+'</div></article>').join(''):'<div class="empty-state"><h3>Nenhum usuário encontrado</h3><p>Tente outro nome ou @usuário.</p></div>';
  }
  async function adminBadge(userId, username) {
    if(!state.isAdmin) throw new Error('Acesso restrito à administração.');
    const key=prompt('Nome do emblema (ex.: criador, parceiro, vip). Use letras minúsculas, números ou _.');
    if(key===null)return;
    const clean=key.trim().toLowerCase().replace(/\s+/g,'_');
    if(!/^[a-z0-9_]{2,32}$/.test(clean))throw new Error('Use 2 a 32 caracteres: letras minúsculas, números ou _.');
    const {error}=await state.client.rpc('admin_set_badge',{target_user:userId,target_badge:clean,should_grant:true});
    if(error)throw error;
    notice('Emblema @'+clean+' atribuído a @'+username+'.','success');
    await renderAdminPage();
  }
  async function adminRemoveBadge(userId, username) {
    if(!state.isAdmin)throw new Error('Acesso restrito à administração.');
    const key=prompt('Qual emblema deseja remover de @'+username+'? Informe a chave do emblema.');
    if(key===null)return;
    const clean=key.trim().toLowerCase().replace(/\s+/g,'_');
    if(!/^[a-z0-9_]{2,32}$/.test(clean))throw new Error('Chave de emblema inválida.');
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
      closeModal(); state.page='home'; state.feed='all'; go('home'); notice('Foto/vídeo publicado com sucesso.','success');
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
      await renderPage();
    } catch(e) { notice('Não foi possível atualizar a curtida: '+e.message,'error'); }
  }
  async function savePost(id) {
    if (!authRequired()) return;
    try {
      const {data:existing,error:readError}=await state.client.from('bookmarks').select('post_id').eq('user_id',state.session.user.id).eq('post_id',id).maybeSingle();
      if(readError) throw readError;
      if(existing) { const {error}=await state.client.from('bookmarks').delete().eq('user_id',state.session.user.id).eq('post_id',id); if(error) throw error; notice('Publicação removida dos salvos.'); }
      else { const {error}=await state.client.from('bookmarks').insert({user_id:state.session.user.id,post_id:id}); if(error) throw error; notice('Publicação salva.','success'); }
      if(state.page==='saved') await renderPage();
    } catch(e) { notice('Não foi possível salvar: '+e.message,'error'); }
  }
  async function submitComment(form) {
    if (!authRequired()) return;
    const body=String(new FormData(form).get('body')||'').trim(), post_id=form.dataset.postId;
    if(!body) return;
    setBusy(true);
    try { const {error}=await state.client.from('comments').insert({user_id:state.session.user.id,post_id,body}); if(error)throw error; closeModal(); await renderPage(); notice('Comentário enviado.','success'); }
    catch(e){notice('Não foi possível comentar: '+e.message,'error');}
    finally{setBusy(false);}
  }
  async function editProfile() {
    if (!authRequired()) return;
    try { if (!state.profile) await loadProfile(); } catch (e) { notice('Não foi possível carregar seu perfil: ' + e.message, 'error'); return; }
    const p = state.profile || {};
    $('#modalBody').innerHTML = '<div class="modal-head"><div><p class="eyebrow">SUA CONTA</p><h2>Editar perfil</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">' + svgIcon('close') + '</button></div><form id="profileForm"><label>Nome exibido<input name="display_name" required maxlength="40" value="' + esc(p.display_name || '') + '"></label><label>Nome de usuário<input name="username" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="' + esc(p.username || '') + '"><span class="muted small">3 a 24 letras, números ou _.</span></label><label>Biografia<textarea name="bio" maxlength="180" rows="3" placeholder="Conte um pouco sobre você…">' + esc(p.bio || '') + '</textarea></label><label>URL da foto de perfil<input name="avatar_url" type="url" maxlength="500" placeholder="https://…" value="' + esc(p.avatar_url || '') + '"></label><p class="muted small">Seu e-mail não aparece no perfil público.</p><button class="btn primary full" type="submit" data-busy>Salvar alterações</button></form>';
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
    if (!display_name) { notice('Informe seu nome de exibição.', 'error'); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) { notice('O nome de usuário deve ter 3 a 24 caracteres: letras, números ou _.', 'error'); return; }
    if (avatar_url && !/^https:\/\//i.test(avatar_url)) { notice('A foto precisa usar um endereço HTTPS.', 'error'); return; }
    setBusy(true);
    try {
      const updates = {display_name, username, bio, avatar_url: avatar_url || null};
      const {data,error} = await state.client.from('profiles').update(updates).eq('id',state.session.user.id).select('id,username,display_name,bio,avatar_url').single();
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
  async function followUser(id, username) {
    if(!authRequired())return;
    if(id===state.session.user.id){notice('Esse é o seu próprio perfil.');return;}
    try{
      const {data:existing,error:r}=await state.client.from('follows').select('followed_id').eq('follower_id',state.session.user.id).eq('followed_id',id).maybeSingle();if(r)throw r;
      if(existing){const {error}=await state.client.from('follows').delete().eq('follower_id',state.session.user.id).eq('followed_id',id);if(error)throw error;notice('Você deixou de seguir @'+username+'.');}
      else{const {error}=await state.client.from('follows').insert({follower_id:state.session.user.id,followed_id:id});if(error)throw error;notice('Agora você segue @'+username+'.','success');}
      await searchProfiles($('#peopleSearch')?.value||username);
    }catch(e){notice('Não foi possível atualizar o seguimento: '+e.message,'error');}
  }
  async function handleAction(action, el) {
    const id=el.dataset.id;
    if(action==='admin-panel') { if(!state.isAdmin)throw new Error('Acesso restrito à administração.'); go('admin'); return; }
    if(action==='admin-refresh') return renderAdminPage();
    if(action==='admin-badge') return adminBadge(id,el.dataset.username);
    if(action==='admin-remove-badge') return adminRemoveBadge(id,el.dataset.username);
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
    if(action==='post-more') { const p=state.posts.find(x=>x.id===id); if(p?.user_id===state.session?.user?.id){if(confirm('Excluir esta publicação? Esta ação não pode ser desfeita.')){const {error}=await state.client.from('posts').delete().eq('id',id).eq('user_id',state.session.user.id);if(error)notice(error.message,'error');else{notice('Publicação excluída.','success');await renderPage();}}}else notice('Opções adicionais estarão disponíveis em breve.'); return; }
    if(action==='signout') { const {error}=await state.client.auth.signOut(); if(error)notice(error.message,'error');else{state.session=null;state.profile=null;updateAccountUI();go('home');notice('Você saiu da conta.');} return; }
    if(action==='edit-profile') return editProfile();
    if(action==='follow') return followUser(el.dataset.id,el.dataset.username);
    if(action==='people-search') return searchProfiles($('#peopleSearch')?.value||'');
    if(action==='open-people') { $('#content').innerHTML='<section class="panel"><h2>Encontrar pessoas</h2><form id="peopleSearchForm" class="search-form"><input id="peopleSearch" placeholder="Nome ou @usuário" autocomplete="off"><button class="btn primary" type="submit">Buscar</button></form><div id="peopleResults"><p class="muted">Pesquise para encontrar pessoas da comunidade.</p></div></section>'; return; }
  }
  document.addEventListener('input', e => { if(e.target?.id==='adminSearch') renderAdminUsers(); });
  document.addEventListener('click', async e => {
    const target=e.target instanceof Element?e.target:null; if(!target)return;
    const nav=target.closest('[data-go]'); if(nav){e.preventDefault();go(nav.dataset.go);return;}
    const act=target.closest('[data-action]');if(act){e.preventDefault();try{await handleAction(act.dataset.action,act);}catch(err){console.error(err);notice(err.message||'A ação falhou.','error');}return;}
    const feed=target.closest('[data-feed-mode]');if(feed){state.feed=feed.dataset.feedMode;$$('[data-feed-mode]').forEach(b=>b.classList.toggle('active',b===feed));await renderFeed().catch(err=>notice(err.message,'error'));return;}
    const mode=target.closest('[data-auth-mode]');if(mode){const form=$('#authForm');form.dataset.mode=mode.dataset.authMode;$('#authTitle').textContent=mode.dataset.authMode==='signup'?'Crie sua conta':'Entre na sua conta';$('#signupFields').hidden=mode.dataset.authMode!=='signup';$('#authSubmit').textContent=mode.dataset.authMode==='signup'?'Criar conta':'Entrar';$$('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b===mode));return;}
    if(target.id==='modal'){closeModal();}
  });
  document.addEventListener('submit', async e => {
    const form=e.target;if(!(form instanceof HTMLFormElement))return;
    if(form.id==='authForm'){e.preventDefault();form.dataset.mode=form.dataset.mode||'login';await submitAuth(form);}
    if(form.id==='postForm'){e.preventDefault();await publishPost(form);}
    if(form.id==='commentForm'){e.preventDefault();await submitComment(form);}
    if(form.id==='profileForm'){e.preventDefault();await submitProfile(form);}
    if(form.id==='searchForm'){e.preventDefault();state.search=$('#searchInput').value.trim();state.page='explore';go('explore');}
    if(form.id==='peopleSearchForm'){e.preventDefault();await searchProfiles($('#peopleSearch').value);}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  async function init() {
    updateAccountUI();
    try { await ensureClient(); await renderPage(); }
    catch(e) {
      console.error('TeurChat initialization:',e);
      $('#content').innerHTML='<section class="empty-state"><div class="empty-mark">!</div><h2>O TeurChat não conseguiu conectar</h2><p>'+esc(e.message||'Verifique a conexão.')+'</p><button class="btn primary" data-action="refresh">Tentar novamente</button></section>';
      notice('Falha na inicialização. Veja a mensagem na tela.','error');
    }
  }
  window.TeurChatApp={go,renderPage,refresh:()=>renderPage(),openAuth:()=>openModal('auth')};
  init();
})();
