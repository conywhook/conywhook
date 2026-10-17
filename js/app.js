(() => {
  'use strict';

  const cfg = window.CONYWHOOK_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    document.getElementById('app').innerHTML =
      '<div class="panel empty"><h1>Не настроено</h1><p>Заполните js/config.js: SUPABASE_URL и SUPABASE_ANON_KEY.</p></div>';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const ROLE_NAMES = { owner: 'Владелец', admin: 'Администратор', coder: 'Разработчик', user: 'Участник' };
  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  const state = { me: null, flashes: [] };

  // ---------- утилиты ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => (v ? new Date(v).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const $app = () => document.getElementById('app');
  const isStaff = () => !!state.me && !state.me.banned && (state.me.role === 'owner' || state.me.role === 'admin');
  const isSupport = () => !!state.me && !state.me.banned && ['owner', 'admin'].includes(state.me.role);
  const isOwner = () => !!state.me && state.me.role === 'owner';
  const emailFor = (name) => `${name.toLowerCase()}@conywhook.local`;
  const roleTag = (r) => `<span class="role role-${esc(r)}">${esc(ROLE_NAMES[r] || r)}</span>`;
  const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

  function flash(msg) { state.flashes.push(msg); }
  function flashHtml() {
    const html = state.flashes.map((m) => `<div class="flash">${esc(m)}</div>`).join('');
    state.flashes = [];
    return html;
  }
  function friendlyError(err) {
    const m = String(err?.message || err || '');
    if (/profiles_username_lower|duplicate key|already registered|Database error saving new user/i.test(m)) {
      return 'Этот ник уже занят или инвайт недействителен.';
    }
    return m;
  }
  function render(html) { $app().innerHTML = flashHtml() + html; }
  function notFound() { render('<div class="panel empty"><h1>404</h1><p>Страница не найдена.</p></div>'); }
  function goto(hash) { if (location.hash === hash) return route(); location.hash = hash; }
  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  }
  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { state.me = null; return; }
    const { data, error } = await sb.rpc('my_profile');
    state.me = !error && data && data.length ? data[0] : null;
  }
  function renderNav() {
    const links = ['<a href="#/">Форум</a>'];
    if (state.me) {
      links.push('<a href="#/tickets">Тикеты</a>');
      if (isStaff()) links.push('<a href="#/admin">Администрация</a>');
      links.push(`<a href="#/u/${state.me.uid}">${esc(state.me.username)} <span class="uid">#${state.me.uid}</span></a>`);
      links.push('<button class="link" data-action="logout">Выйти</button>');
    } else {
      links.push('<a href="#/login">Вход</a>', '<a href="#/register">Регистрация</a>');
    }
    document.getElementById('nav').innerHTML = links.join('');
  }
  function needLogin(next) {
    flash('Сначала войдите в аккаунт.');
    goto('#/login?next=' + encodeURIComponent(next));
  }

  // ---------- представления ----------
  async function viewIndex() {
    const [cats, threads] = await Promise.all([
      sb.from('categories').select('id, name, description').order('position').order('id'),
      sb.from('thread_list').select('category_id, last_post_at'),
    ]);
    if (cats.error) throw cats.error;
    if (threads.error) throw threads.error;
    const stats = {};
    for (const t of threads.data) {
      const s = (stats[t.category_id] ??= { count: 0, last: null });
      s.count++;
      if (!s.last || t.last_post_at > s.last) s.last = t.last_post_at;
    }
    const rows = cats.data.map((c) => {
      const s = stats[c.id] || { count: 0, last: null };
      return `<a class="row" href="#/c/${c.id}">
        <div class="grow"><div class="row-title">${esc(c.name)}</div><div class="muted">${esc(c.description)}</div></div>
        <div class="stat">${s.count} тредов</div><div class="stat muted">${fmt(s.last)}</div></a>`;
    }).join('');
    render(`<h1>Разделы</h1><div class="panel">${rows || '<div class="row muted">Разделов пока нет.</div>'}</div>`);
  }

  async function viewCategory(id) {
    const [cat, threads] = await Promise.all([
      sb.from('categories').select('id, name, staff_only').eq('id', id).maybeSingle(),
      sb.from('thread_list')
        .select('id, title, is_pinned, is_locked, author_name, created_at, last_post_at, replies')
        .eq('category_id', id)
        .order('is_pinned', { ascending: false })
        .order('last_post_at', { ascending: false }),
    ]);
    if (cat.error) throw cat.error;
    if (threads.error) throw threads.error;
    if (!cat.data) return notFound();
    const postBtn = !state.me
      ? '<a class="btn" href="#/login">Войдите, чтобы писать</a>'
      : state.me.banned ? '<span class="muted">Аккаунт заблокирован</span>'
      : (!cat.data.staff_only || isStaff())
        ? `<a class="btn" href="#/c/${id}/new">Новый тред</a>`
        : '<span class="muted">Раздел только для администрации</span>';
    const rows = threads.data.map((t) => `<a class="row" href="#/t/${t.id}"><div class="grow">
        <div class="row-title">${t.is_pinned ? '<span class="tag">закреплён</span>' : ''}${t.is_locked ? '<span class="tag lock">закрыт</span>' : ''}${esc(t.title)}</div>
        <div class="muted">${esc(t.author_name)} · ${fmt(t.created_at)}</div></div>
        <div class="stat">${t.replies} отв.</div><div class="stat muted">${fmt(t.last_post_at)}</div></a>`).join('');
    render(`<div class="crumbs"><a href="#/">Форум</a> / ${esc(cat.data.name)}</div>
      <div class="head-row"><h1>${esc(cat.data.name)}</h1>
      ${postBtn}</div>
      <div class="panel">${rows || '<div class="row muted">В этом разделе ещё нет тредов.</div>'}</div>`);
  }

  async function viewNewThread(catId) {
    if (!state.me) return needLogin(`/c/${catId}/new`);
    if (state.me.banned) { flash('Аккаунт заблокирован.'); return goto(`#/c/${catId}`); }
    const cat = await sb.from('categories').select('staff_only').eq('id', catId).maybeSingle();
    if (cat.error) throw cat.error;
    if (cat.data?.staff_only && !isStaff()) {
      flash('В этот раздел могут писать только администраторы.');
      return goto(`#/c/${catId}`);
    }
    render(`<div class="crumbs"><a href="#/">Форум</a> / <a href="#/c/${catId}">раздел</a> / новый тред</div>
      <h1>Новый тред</h1>
      <form class="panel form" data-form="new-thread" data-cat="${catId}">
        <label>Заголовок<input name="title" required minlength="3" maxlength="120"></label>
        <label>Текст<textarea name="body" rows="10" required maxlength="20000"></textarea></label>
        <button class="btn" type="submit">Опубликовать</button>
      </form>`);
  }

  async function viewThread(id) {
    const [t, posts] = await Promise.all([
      sb.from('thread_list').select('*').eq('id', id).maybeSingle(),
      sb.from('posts').select('id, body, created_at, author:profiles!author_uid(uid, username, role)')
        .eq('thread_id', id).order('id'),
    ]);
    if (t.error) throw t.error;
    if (posts.error) throw posts.error;
    if (!t.data) return notFound();
    const

