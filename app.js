(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = { client: null, session: null, profile: null, page: 'home', feed: 'all', posts: [], search: '', busy: false };
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
    const allowed = ['home','explore','saved','messages','profile','notifications'];
    state.page = allowed.includes(page) ? page : 'home';
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.go === state.page));
    $('#pageTitle').textContent = ({home:'Início',explore:'Explorar',saved:'Salvos',messages:'Mensagens',profile:'Meu perfil',notifications:'Notificações'})[state.page];
    renderPage().catch(e => { console.error(e); notice('Não foi possível abrir esta área: ' + (e.message || 'erro')); });
  }
  function openModal(kind, extra = {}) {
    const modal = $('#modal'); if (!modal) return;
    modal.dataset.kind = kind; modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
    const body = $('#modalBody');
    if (kind === 'auth') {
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">BEM-VINDO AO TEURCHAT</p><h2 id="authTitle">Entre na sua conta</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">×</button></div><div class="auth-switch"><button class="switch active" data-auth-mode="login">Entrar</button><button class="switch" data-auth-mode="signup">Criar conta</button></div><form id="authForm"><label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="voce@email.com"></label><label>Senha<input name="password" type="password" minlength="6" autocomplete="current-password" required placeholder="Mínimo de 6 caracteres"></label><div id="signupFields" hidden><label>Nome de usuário<input name="username" autocomplete="username" minlength="3" maxlength="24" placeholder="seunome"></label><label>Como quer ser chamado?<input name="display_name" maxlength="40" placeholder="Seu nome"></label></div><button class="btn primary full" data-busy type="submit" id="authSubmit">Entrar</button><p class="muted small">Sua conta é protegida pelo Supabase do TeurChat.</p></form>';
    } else if (kind === 'compose') {
      if (!authRequired()) return;
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">COMPARTILHE COM A COMUNIDADE</p><h2>Nova publicação</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">×</button></div><form id="postForm"><label>O que você quer compartilhar?<textarea name="body" required maxlength="1200" rows="5" placeholder="Escreva sua publicação..."></textarea></label><div class="form-foot"><span class="muted small">Até 1.200 caracteres</span><button class="btn primary" type="submit" data-busy>Publicar ↗</button></div></form>';
    } else if (kind === 'comment') {
      if (!authRequired()) return;
      body.innerHTML = '<div class="modal-head"><div><p class="eyebrow">CONVERSA</p><h2>Comentar publicação</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">×</button></div><form id="commentForm" data-post-id="' + esc(extra.postId) + '"><label>Seu comentário<textarea name="body" required maxlength="500" rows="3" placeholder="Escreva um comentário..."></textarea></label><button class="btn primary full" type="submit" data-busy>Enviar comentário</button></form>';
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
    if (!state.session?.user) return;
    const { data, error } = await state.client.from('profiles').select('id,username,display_name,bio,avatar_url').eq('id',state.session.user.id).maybeSingle();
    if (error) throw error;
    state.profile = data;
  }
  function updateAccountUI() {
    const p = state.profile, btn = $('#accountButton');
    if (btn) btn.innerHTML = isSignedIn() ? '<span class="avatar tiny">' + esc(initials(p?.display_name || p?.username || state.session.user.email)) + '</span><span class="account-label">' + esc(p?.display_name || p?.username || 'Minha conta') + '</span>' : '<span class="avatar tiny">↗</span><span class="account-label">Entrar</span>';
    $('#composeButton').disabled = !isSignedIn();
    $('#sessionHint').textContent = isSignedIn() ? '@' + (p?.username || 'usuario') : 'Entre para publicar, curtir e conversar.';
  }
  const avatar = p => '<span class="avatar">' + esc(initials(p?.display_name || p?.username || 'U')) + '</span>';
  function renderPost(p) {
    const profile = p.profiles || {};
    const liked = Array.isArray(p.likes) && p.likes.some(x => x.user_id === state.session?.user?.id);
    const likes = p.likes?.length || 0, comments = p.comments?.length || 0;
    return '<article class="post-card" data-post="' + esc(p.id) + '"><div class="post-top">' + avatar(profile) + '<div class="post-author"><strong>' + esc(profile.display_name || profile.username || 'Usuário TeurChat') + '</strong><span>@' + esc(profile.username || 'usuario') + ' · ' + esc(new Date(p.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})) + '</span></div><button class="icon-btn post-more" data-action="post-more" data-id="' + esc(p.id) + '" aria-label="Mais opções">•••</button></div><div class="post-body">' + esc(p.body) + '</div>' + (p.media_url ? '<a class="media-link" href="' + esc(p.media_url) + '" target="_blank" rel="noopener">Abrir mídia ↗</a>' : '') + '<div class="post-actions"><button class="action ' + (liked?'selected':'') + '" data-action="like" data-id="' + esc(p.id) + '"><span>' + (liked?'♥':'♡') + '</span> ' + likes + '</button><button class="action" data-action="comment" data-id="' + esc(p.id) + '"><span>◯</span> ' + comments + '</button><button class="action" data-action="save" data-id="' + esc(p.id) + '"><span>◇</span> Salvar</button><button class="action share-action" data-action="share" data-id="' + esc(p.id) + '"><span>↗</span> Compartilhar</button></div></article>';
  }
  async function fetchPosts() {
    let query = state.client.from('posts').select('id,user_id,body,media_url,created_at,profiles(username,display_name,avatar_url),likes(user_id),comments(id)').order('created_at',{ascending:false}).limit(40);
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
        target.innerHTML = '<section class="empty-state"><div class="empty-mark">✳</div><h2>' + (state.page==='explore'?'Nada encontrado por enquanto':'Sua comunidade começa aqui') + '</h2><p>' + (state.page==='explore'?'Tente outra busca ou volte mais tarde.':'Ainda não há publicações para mostrar. Seja a primeira pessoa a compartilhar algo.') + '</p><button class="btn primary" data-action="compose">Criar publicação</button></section>';
        return;
      }
      target.innerHTML = state.posts.map(renderPost).join('');
    } catch (e) {
      console.error(e);
      target.innerHTML = '<section class="empty-state"><div class="empty-mark">!</div><h2>Não foi possível carregar o feed</h2><p>' + esc(e.message || 'Verifique a conexão e as permissões do banco.') + '</p><button class="btn primary" data-action="refresh">Tentar novamente</button></section>';
    }
  }
  async function renderPage() {
    if (!state.client) return;
    if (['home','explore','saved'].includes(state.page)) {
      $('#feedFilters').hidden = state.page !== 'home';
      $('#searchBar').hidden = state.page !== 'explore';
      if (state.page === 'saved') {
        if (!authRequired()) { go('home'); return; }
        const {data,error} = await state.client.from('saved_posts').select('post_id').eq('user_id',state.session.user.id);
        if (error) { $('#content').innerHTML='<div class="empty-state"><h2>Salvos indisponíveis</h2><p>O banco ainda não oferece a tabela de salvos. '+esc(error.message)+'</p></div>'; return; }
        const ids = (data||[]).map(x=>x.post_id);
        if (!ids.length) { $('#content').innerHTML='<div class="empty-state"><h2>Nenhuma publicação salva</h2><p>Use “Salvar” em uma publicação para encontrá-la aqui.</p></div>'; return; }
        const {data:posts,error:e} = await state.client.from('posts').select('id,user_id,body,media_url,created_at,profiles(username,display_name,avatar_url),likes(user_id),comments(id)').in('id',ids).order('created_at',{ascending:false});
        if (e) throw e; state.posts=posts||[]; $('#content').innerHTML=state.posts.map(renderPost).join(''); return;
      }
      await renderFeed(); return;
    }
    $('#feedFilters').hidden = true; $('#searchBar').hidden = true;
    if (state.page === 'profile') {
      if (!authRequired()) { go('home'); return; }
      const p = state.profile || {};
      $('#content').innerHTML = '<section class="profile-card"><div class="profile-cover"></div><div class="profile-info">' + avatar(p) + '<h2>' + esc(p.display_name || 'Meu perfil') + '</h2><p>@' + esc(p.username || 'usuario') + '</p><p>' + esc(p.bio || 'Adicione uma descrição ao seu perfil.') + '</p><button class="btn secondary" data-action="edit-profile">Editar perfil</button><button class="btn secondary" data-action="signout">Sair da conta</button></div></section><section class="panel"><h3>Minhas publicações</h3><div id="myPosts"><div class="loading">Carregando…</div></div></section>';
      const {data,error}=await state.client.from('posts').select('id,user_id,body,media_url,created_at,profiles(username,display_name,avatar_url),likes(user_id),comments(id)').eq('user_id',state.session.user.id).order('created_at',{ascending:false}).limit(30);
      if(error) throw error; $('#myPosts').innerHTML=data?.length?data.map(renderPost).join(''):'<p class="muted">Você ainda não publicou nada.</p>'; return;
    }
    if (state.page === 'messages') {
      if (!authRequired()) { go('home'); return; }
      $('#content').innerHTML = '<section class="empty-state"><div class="empty-mark">✉</div><h2>Suas conversas</h2><p>Para começar, encontre uma pessoa em Explorar e abra o perfil dela. A área de mensagens depende das permissões de conversas do banco.</p><button class="btn primary" data-go="explore">Encontrar pessoas</button></section>'; return;
    }
    if (state.page === 'notifications') {
      if (!authRequired()) { go('home'); return; }
      $('#content').innerHTML = '<section class="empty-state"><div class="empty-mark">♧</div><h2>Notificações</h2><p>Você verá novidades da sua conta aqui quando houver notificações disponíveis.</p><button class="btn secondary" data-action="refresh">Atualizar</button></section>'; return;
    }
  }
  async function submitAuth(form) {
    const fd = new FormData(form), email = String(fd.get('email')||'').trim(), password = String(fd.get('password')||'');
    setBusy(true);
    try {
      const mode = form.dataset.mode || 'login';
      if (mode === 'signup') {
        const username = String(fd.get('username')||'').trim().toLowerCase().replace(/^@/,'');
        const display_name = String(fd.get('display_name')||username).trim() || username;
        if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Use um nome de usuário de 3 a 24 caracteres: letras, números ou _.');
        const {data,error} = await state.client.auth.signUp({email,password,options:{data:{username,display_name}}});
        if (error) throw error;
        if (data.session) { state.session=data.session; await loadProfile(); closeModal(); updateAccountUI(); go('home'); notice('Conta criada com sucesso.','success'); }
        else { closeModal(); notice('Cadastro iniciado. Confira seu e-mail para confirmar a conta.','success'); }
      } else {
        const {data,error} = await state.client.auth.signInWithPassword({email,password});
        if (error) throw error; state.session=data.session; await loadProfile(); closeModal(); updateAccountUI(); go('home'); notice('Você entrou no TeurChat.','success');
      }
    } catch(e) { notice(e.message || 'Não foi possível entrar.','error'); }
    finally { setBusy(false); }
  }
  async function publishPost(form) {
    if (!authRequired()) return;
    const body = String(new FormData(form).get('body')||'').trim();
    if (!body) { notice('Escreva algo antes de publicar.'); return; }
    setBusy(true);
    try {
      const {error} = await state.client.from('posts').insert({user_id:state.session.user.id,body});
      if (error) throw error;
      closeModal(); state.page='home'; state.feed='all'; go('home'); notice('Publicação enviada.','success');
    } catch(e) { notice('Não foi possível publicar: ' + e.message,'error'); }
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
      const {data:existing,error:readError}=await state.client.from('saved_posts').select('post_id').eq('user_id',state.session.user.id).eq('post_id',id).maybeSingle();
      if(readError) throw readError;
      if(existing) { const {error}=await state.client.from('saved_posts').delete().eq('user_id',state.session.user.id).eq('post_id',id); if(error) throw error; notice('Publicação removida dos salvos.'); }
      else { const {error}=await state.client.from('saved_posts').insert({user_id:state.session.user.id,post_id:id}); if(error) throw error; notice('Publicação salva.','success'); }
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
    if(!authRequired()) return;
    const p=state.profile||{};
    $('#modalBody').innerHTML='<div class="modal-head"><div><p class="eyebrow">SUA CONTA</p><h2>Editar perfil</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="profileForm"><label>Nome exibido<input name="display_name" required maxlength="40" value="'+esc(p.display_name||'')+'"></label><label>Bio<textarea name="bio" maxlength="180" rows="3">'+esc(p.bio||'')+'</textarea></label><button class="btn primary full" type="submit" data-busy>Salvar alterações</button></form>';
    $('#modal').dataset.kind='profile';
  }
  async function submitProfile(form) {
    const fd=new FormData(form), updates={display_name:String(fd.get('display_name')||'').trim(),bio:String(fd.get('bio')||'').trim()};
    if(!updates.display_name){notice('Informe um nome.');return;}
    setBusy(true);
    try{const {error}=await state.client.from('profiles').update(updates).eq('id',state.session.user.id);if(error)throw error;await loadProfile();closeModal();updateAccountUI();await renderPage();notice('Perfil atualizado.','success');}
    catch(e){notice('Não foi possível salvar o perfil: '+e.message,'error');}
    finally{setBusy(false);}
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
    if(action==='compose') return openModal('compose');
    if(action==='close-modal') return closeModal();
    if(action==='auth') return openModal('auth');
    if(action==='refresh') return renderPage();
    if(action==='like') return likePost(id);
    if(action==='save') return savePost(id);
    if(action==='comment') return openModal('comment',{postId:id});
    if(action==='share') { const url=location.origin+'/#post-'+id; try{if(navigator.share)await navigator.share({title:'TeurChat',url});else{await navigator.clipboard.writeText(url);notice('Link copiado.','success');}}catch(e){if(e.name!=='AbortError')notice('Não foi possível compartilhar este link.');} return; }
    if(action==='post-more') { const p=state.posts.find(x=>x.id===id); if(p?.user_id===state.session?.user?.id){if(confirm('Excluir esta publicação? Esta ação não pode ser desfeita.')){const {error}=await state.client.from('posts').delete().eq('id',id).eq('user_id',state.session.user.id);if(error)notice(error.message,'error');else{notice('Publicação excluída.','success');await renderPage();}}}else notice('Opções adicionais estarão disponíveis em breve.'); return; }
    if(action==='signout') { const {error}=await state.client.auth.signOut(); if(error)notice(error.message,'error');else{state.session=null;state.profile=null;updateAccountUI();go('home');notice('Você saiu da conta.');} return; }
    if(action==='edit-profile') return editProfile();
    if(action==='follow') return followUser(el.dataset.id,el.dataset.username);
    if(action==='people-search') return searchProfiles($('#peopleSearch')?.value||'');
    if(action==='open-people') { $('#content').innerHTML='<section class="panel"><h2>Encontrar pessoas</h2><form id="peopleSearchForm" class="search-form"><input id="peopleSearch" placeholder="Nome ou @usuário" autocomplete="off"><button class="btn primary" type="submit">Buscar</button></form><div id="peopleResults"><p class="muted">Pesquise para encontrar pessoas da comunidade.</p></div></section>'; return; }
  }
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
