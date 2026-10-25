(() => {
  'use strict';

  const cfg = window.CONYWHOOK_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    document.getElementById('app').innerHTML =
      '<div class="panel empty"><h1>Не настроено</h1><p>Заполните js/config.js: SUPABASE_URL и SUPABASE_ANON_KEY.</p></div>';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const ROLE_NAMES = { owner: 'Владелец', admin: 'Администратор', helper: 'Помощник', user: 'Участник' };
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
  const DEFAULT_AVATAR = 'data:image/jpeg;base64,...берите из архива...';
  const avatarHtml = (u, cls = '') =>
    `<img class="avatar ${cls}" src="${esc(u?.avatar_url || DEFAULT_AVATAR)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  const ROLE_DESC = {
    owner: 'Полный доступ: роли, баны, разделы и все тикеты.',
    admin: 'Модерация, инвайты, разделы и все тикеты.',
    helper: 'Особых прав на сайте пока нет.',
    user: 'Участник форума.',
  };

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
      links.push('<a href="#/messages">Сообщения</a>');
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

  // ---------- чат и статистика ----------
  let chatTimer = null;
  const chatLine = (m) => {
    if (m.is_bot) {
      return `<div class="chat-msg bot"><div class="chat-main"><span class="chat-name">ChatBot</span> <span class="muted">${fmt(m.created_at)}</span><div class="chat-body">${esc(m.body)}</div></div></div>`;
    }
    const a = m.author || { uid: 0, username: '?', role: 'user' };
    return `<div class="chat-msg"><div class="avatar-wrap">${avatarHtml(a, 'avatar-xs')}</div><div class="chat-main"><a class="chat-name" href="#/u/${a.uid}">${esc(a.username)}</a> ${roleTag(a.role)} <span class="muted">${fmt(m.created_at)}</span><div class="chat-body">${esc(m.body)}</div></div></div>`;
  };
  async function loadChat() {
    const box = document.getElementById('chat-box');
    if (!box) return;
    const { data, error } = await sb.from('chat_messages')
      .select('id, body, created_at, is_bot, author:profiles!author_uid(uid, username, role, avatar_url)')
      .order('id', { ascending: false }).limit(50);
    if (!document.getElementById('chat-box')) return;
    if (error) { box.innerHTML = `<div class="muted">${esc(friendlyError(error))}</div>`; return; }
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = data.slice().reverse().map(chatLine).join('') || '<div class="muted">Сообщений пока нет.</div>';
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  async function loadStats() {
    const el = document.getElementById('site-stats');
    if (!el) return;
    const { data, error } = await sb.rpc('site_stats');
    if (!document.getElementById('site-stats')) return;
    if (error || !data || !data.length) { el.innerHTML = ''; return; }
    const s = data[0];
    el.innerHTML = `<div class="stats-plate"><span>Участников: <b>${s.members}</b></span><span>Последний: <a href="#/u/${s.last_uid}">${esc(s.last_username)}</a> <span class="muted">${fmt(s.last_joined)}</span></span></div>`;
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
    const clearBtn = isStaff() ? '<button class="btn small danger" data-action="chat-clear">Очистить чат</button>' : '';
    let chatInner;
    if (!state.me) {
      chatInner = '<div class="panel empty muted">Чат виден только зарегистрированным участникам. <a href="#/login">Войдите</a>.</div>';
    } else {
      const form = state.me.banned
        ? '<div class="muted">Аккаунт заблокирован: писать в чат нельзя.</div>'
        : '<form class="chat-form" data-form="chat"><input name="body" maxlength="1000" required placeholder="Написать в общий чат" autocomplete="off"><button class="btn" type="submit">Отправить</button></form>';
      chatInner = `<div class="panel chat">
          <div class="chat-head">${clearBtn}</div>
          <div id="chat-box" class="chat-box"></div>
          ${form}
        </div>`;
    }
    render(`<div id="site-stats"></div>
      <h1>Разделы</h1>
      <div class="panel">${rows || '<div class="row muted">Разделов пока нет.</div>'}</div>
      <h2>Общий чат</h2>
      ${chatInner}`);
    loadStats();
    if (state.me) {
      loadChat();
      chatTimer = setInterval(loadChat, 5000);
    }
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
      sb.from('posts').select('id, body, created_at, author:profiles!author_uid(uid, username, role, avatar_url)')
        .eq('thread_id', id).order('id'),
    ]);
    if (t.error) throw t.error;
    if (posts.error) throw posts.error;
    if (!t.data) return notFound();
    const th = t.data;
    const catRes = await sb.from('categories').select('staff_only').eq('id', th.category_id).maybeSingle();
    const staffOnly = !!catRes.data?.staff_only;
    const mod = isStaff() ? `<div class="mod panel">
        <span class="muted">Модерация:</span>
        <button class="btn small" data-action="thread-mod" data-thread="${th.id}" data-mod="pin">${th.is_pinned ? 'Открепить' : 'Закрепить'}</button>
        <button class="btn small" data-action="thread-mod" data-thread="${th.id}" data-mod="lock">${th.is_locked ? 'Открыть' : 'Закрыть'}</button>
        <button class="btn small danger" data-action="thread-delete" data-thread="${th.id}" data-category="${th.category_id}">Удалить тред</button>
      </div>` : '';
    const postsHtml = posts.data.map((p, i) => `<article class="post" id="post-${p.id}">
        <aside class="author">
          ${avatarHtml(p.author)}
          <a class="name" href="#/u/${p.author.uid}">${esc(p.author.username)}</a>
          ${roleTag(p.author.role)}
          <div class="muted">UID ${p.author.uid}</div>
        </aside>
        <div class="content">
          <div class="meta muted">${fmt(p.created_at)} · #${i + 1}
            ${isStaff() && i > 0 ? ` <button class="link danger" data-action="post-delete" data-post="${p.id}">удалить</button>` : ''}
          </div>
          <div class="body">${esc(p.body)}</div>
        </div></article>`).join('');
    let replyBox;
    if (!state.me) {
      replyBox = `<div class="panel muted"><a href="#/login?next=${encodeURIComponent('/t/' + id)}">Войдите</a>, чтобы ответить.</div>`;
    } else if (state.me.banned) {
      replyBox = '<div class="panel muted">Аккаунт заблокирован. Писать нельзя.</div>';
    } else if (staffOnly && !isStaff()) {
      replyBox = '<div class="panel muted">В этом разделе писать могут только администраторы.</div>';
    } else if (th.is_locked && !isStaff()) {
      replyBox = '<div class="panel muted">Тред закрыт для ответов.</div>';
    } else {
      replyBox = `<form class="panel form" data-form="reply" data-thread="${id}">
        <label>Ответ<textarea name="body" rows="6" required maxlength="20000"></textarea></label>
        <button class="btn" type="submit">Ответить</button></form>`;
    }
    render(`<div class="crumbs"><a href="#/">Форум</a> / <a href="#/c/${th.category_id}">${esc(th.category_name)}</a></div>
      <h1>${th.is_pinned ? '<span class="tag">закреплён</span>' : ''}${th.is_locked ? '<span class="tag lock">закрыт</span>' : ''}${esc(th.title)}</h1>
      ${mod}${postsHtml}${replyBox}`);
  }

  async function viewProfile(uid) {
    const [u, tc, pc, recent] = await Promise.all([
      sb.from('profiles').select('uid, username, role, created_at, banned, avatar_url, bio').eq('uid', uid).maybeSingle(),
      sb.from('threads').select('id', { count: 'exact', head: true }).eq('author_uid', uid),
      sb.from('posts').select('id', { count: 'exact', head: true }).eq('author_uid', uid),
      sb.from('thread_list').select('id, title, category_name, created_at')
        .eq('author_uid', uid).order('id', { ascending: false }).limit(10),
    ]);
    for (const r of [u, tc, pc, recent]) if (r.error) throw r.error;
    if (!u.data) return notFound();
    const p = u.data;
    const own = !!state.me && state.me.uid === p.uid;
    const list = recent.data.map((t) => `<a class="row" href="#/t/${t.id}"><div class="grow">
        <div class="row-title">${esc(t.title)}</div>
        <div class="muted">${esc(t.category_name)} · ${fmt(t.created_at)}</div></div></a>`).join('');
    const editForm = own ? `<h2>Редактировать профиль</h2>
      <form class="panel form" data-form="profile">
        <label>Загрузить картинку (до 2 МБ: PNG, JPG, GIF, WEBP)
          <input type="file" name="avatarFile" accept="image/png,image/jpeg,image/gif,image/webp"></label>
        <label>Или ссылка на аватар (https://…, поле пустое — аватар убрать)
          <input name="avatar" value="${esc(p.avatar_url || '')}" maxlength="500" placeholder="https://example.com/avatar.png"></label>
        <label>Описание (до 500 символов)
          <textarea name="bio" rows="4" maxlength="500">${esc(p.bio || '')}</textarea></label>
        <button class="btn" type="submit">Сохранить</button>
      </form>` : '';
    render(`<div class="profile-head">
        ${avatarHtml(p, 'avatar-lg')}
        <div>
          <h1>${esc(p.username)} <span class="uid">#${p.uid}</span></h1>
          ${state.me && !own && !state.me.banned ? `<a class="btn small" href="#/messages/${p.uid}">Написать</a>` : ''}
          <div class="role-card">${roleTag(p.role)} <span class="muted">${esc(ROLE_DESC[p.role] || '')}</span></div>
        </div>
      </div>
      ${p.banned ? '<div class="panel muted">Аккаунт заблокирован.</div>' : ''}
      <div class="panel profile">
        <div class="row"><span class="muted">UID</span><b>${p.uid}</b></div>
        <div class="row"><span class="muted">Регистрация</span>${fmt(p.created_at)}</div>
        <div class="row"><span class="muted">Тредов</span>${tc.count ?? 0}</div>
        <div class="row"><span class="muted">Сообщений</span>${pc.count ?? 0}</div>
      </div>
      <h2>О себе</h2>
      <div class="panel bio">${p.bio ? esc(p.bio) : '<span class="muted">Пока пусто.</span>'}</div>
      ${editForm}
      <h2>Последние треды</h2>
      <div class="panel">${list || '<div class="row muted">Тредов пока нет.</div>'}</div>`);
  }

  function viewLogin(_m, params) {
    if (state.me) return goto('#/');
    const next = esc(params.get('next') || '');
    render(`<h1>Вход</h1>
      <form class="panel form narrow" data-form="login" data-next="${next}">
        <label>Ник<input name="username" required autocomplete="username"></label>
        <label>Пароль<input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn" type="submit">Войти</button>
      </form>`);
  }

  async function viewRegister(_m, params) {
    if (state.me) return goto('#/');
    const invite = esc(params.get('invite') || '');
    render(`<h1>Регистрация</h1>
      <p class="muted">Регистрация открыта только по инвайт-коду от администрации.</p>
      <form class="panel form narrow" data-form="register">
        <label>Инвайт-код<input name="invite" value="${invite}" required></label>
        <label>Ник (3–20 символов)<input name="username" required pattern="[A-Za-z0-9_]{3,20}" autocomplete="username"></label>
        <label>Пароль (минимум 8)<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label>Повторите пароль<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
        <button class="btn" type="submit">Создать аккаунт</button>
      </form>`);
  }

  async function viewAdmin() {
    if (!isStaff()) return render('<div class="panel empty"><h1>403</h1><p>Доступ запрещён.</p></div>');
    const [users, invites, cats] = await Promise.all([
      sb.from('profiles').select('uid, username, role, banned, created_at, inviter:profiles!invited_by(username)').order('uid'),
      sb.from('invites')
        .select('code, created_at, used_at, creator:profiles!created_by(username), used:profiles!used_by(username)')
        .order('created_at', { ascending: false }).limit(200),
      sb.from('categories').select('id, name, description').order('position').order('id'),
    ]);
    for (const r of [users, invites, cats]) if (r.error) throw r.error;

    const userRows = users.data.map((u) => {
      const parts = [];
      if (isOwner() && u.role !== 'owner') {
        if (u.role === 'admin') {
          parts.push(`<button class="btn small danger" data-action="set-role" data-uid="${u.uid}" data-role="user">Снять админа</button>`);
        } else if (u.role === 'helper') {
          parts.push(`<button class="btn small danger" data-action="set-role" data-uid="${u.uid}" data-role="user">Снять помощника</button>`);
        } else {
          parts.push(`<button class="btn small" data-action="set-role" data-uid="${u.uid}" data-role="admin">Сделать админом</button>`);
          parts.push(`<button class="btn small" data-action="set-role" data-uid="${u.uid}" data-role="helper">Сделать помощником</button>`);
        }
      }
      const canBan = u.role !== 'owner' && u.uid !== state.me.uid && (u.role === 'user' || isOwner());
      if (canBan) {
        parts.push(u.banned
          ? `<button class="btn small" data-action="set-ban" data-uid="${u.uid}" data-banned="false">Разбанить</button>`
          : `<button class="btn small danger" data-action="set-ban" data-uid="${u.uid}" data-banned="true">Забанить</button>`);
      }
      const action = parts.join(' ') || '<span class="muted">—</span>';
      return `<div class="row">
        <div class="stat narrow-col">${u.uid}</div>
        <div class="grow"><a href="#/u/${u.uid}">${esc(u.username)}</a>${u.banned ? ' <span class="tag lock">заблокирован</span>' : ''}</div>
        <div class="stat">${roleTag(u.role)}</div>
        <div class="stat muted">${esc(u.inviter?.username || '—')}</div>
        <div class="stat action">${action}</div></div>`;
    }).join('');

    const inviteRows = invites.data.map((i) => `<div class="row">
        <div class="grow"><code>${esc(i.code)}</code> <span class="muted">${fmt(i.created_at)}</span></div>
        <div class="stat">${esc(i.creator?.username || 'bootstrap')}</div>
        <div class="stat">${i.used_at ? `${esc(i.used?.username || '?')} · ${fmt(i.used_at)}` : '<span class="ok">свободен</span>'}</div>
      </div>`).join('');

    const catRows = cats.data.map((c) => `<div class="row">
        <div class="grow"><b>${esc(c.name)}</b> <span class="muted">${esc(c.description)}</span></div>
        <div class="stat muted">#${c.id}</div></div>`).join('');

    render(`<h1>Администрация</h1>
      <h2>Инвайт-коды</h2>
      <div class="panel inline-form"><button class="btn" data-action="create-invite">Сгенерировать инвайт</button></div>
      <div class="panel">
        <div class="row head"><div class="grow">Код</div><div class="stat">Создал</div><div class="stat">Использован</div></div>
        ${inviteRows || '<div class="row muted">Инвайтов пока нет.</div>'}
      </div>
      <h2>Пользователи</h2>
      <div class="panel">
        <div class="row head"><div class="stat narrow-col">UID</div><div class="grow">Ник</div>
          <div class="stat">Роль</div><div class="stat">Пригласил</div><div class="stat">Действие</div></div>
        ${userRows}
      </div>
      <h2>Разделы</h2>
      <form class="panel form" data-form="category">
        <label>Название<input name="name" required maxlength="60"></label>
        <label>Описание<input name="description" maxlength="200"></label>
        <label>Порядок<input name="position" type="number" value="${cats.data.length + 1}"></label>
        <button class="btn" type="submit">Создать раздел</button>
      </form>
      <div class="panel">${catRows}</div>`);
  }

  // ---------- тикеты ----------
  const TICKET_STATUS = { open: 'Открыт', in_progress: 'В работе', closed: 'Закрыт' };
  const ticketStatus = (s) => `<span class="role ${s === 'closed' ? '' : 'role-admin'}">${esc(TICKET_STATUS[s] || s)}</span>`;

  async function viewTickets() {
    if (!state.me) return needLogin('/tickets');
    const { data, error } = await sb.from('tickets')
      .select('id, subject, status, created_at, author:profiles!author_uid(uid, username)')
      .order('updated_at', { ascending: false }).limit(100);
    if (error) throw error;
    const rows = data.map((t) => `<a class="row" href="#/tickets/${t.id}"><div class="grow">
        <div class="row-title">${esc(t.subject)}</div>
        <div class="muted">${esc(t.author.username)} · ${fmt(t.created_at)}</div></div>
        <div class="stat">${ticketStatus(t.status)}</div></a>`).join('');
    render(`<div class="head-row"><h1>Тикеты</h1><a class="btn" href="#/tickets/new">Новый тикет</a></div>
      <p class="muted">Сообщайте о багах и вопросах по сайту.${isSupport() ? ' Вы видите тикеты всех пользователей.' : ' Вы видите только свои тикеты.'}</p>
      <div class="panel">${rows || '<div class="row muted">Тикетов пока нет.</div>'}</div>`);
  }

  function viewNewTicket() {
    if (!state.me) return needLogin('/tickets/new');
    if (state.me.banned) { flash('Аккаунт заблокирован.'); return goto('#/tickets'); }
    render(`<div class="crumbs"><a href="#/tickets">Тикеты</a> / новый</div>
      <h1>Новый тикет</h1>
      <form class="panel form" data-form="new-ticket">
        <label>Тема<input name="subject" required minlength="3" maxlength="120" placeholder="Например: не открывается страница раздела"></label>
        <label>Описание (что делали, что ожидали, что получилось)<textarea name="body" rows="8" required maxlength="5000"></textarea></label>
        <button class="btn" type="submit">Отправить</button>
      </form>`);
  }

  async function viewTicket(id) {
    if (!state.me) return needLogin(`/tickets/${id}`);
    const [t, msgs] = await Promise.all([
      sb.from('tickets').select('id, subject, status, created_at, author:profiles!author_uid(uid, username)').eq('id', id).maybeSingle(),
      sb.from('ticket_messages').select('id, body, created_at, author:profiles!author_uid(uid, username, role)').eq('ticket_id', id).order('id'),
    ]);
    if (t.error) throw t.error;
    if (msgs.error) throw msgs.error;
    if (!t.data) return notFound();
    const tk = t.data;
    const statusBtns = isSupport()
      ? `<div class="mod panel"><span class="muted">Статус:</span>
          ${['open', 'in_progress', 'closed'].map((s) => `<button class="btn small" data-action="ticket-status" data-ticket="${tk.id}" data-status="${s}" ${tk.status === s ? 'disabled' : ''}>${TICKET_STATUS[s]}</button>`).join(' ')}
        </div>` : '';
    const list = msgs.data.map((m) => `<article class="post">
        <aside class="author"><a class="name" href="#/u/${m.author.uid}">${esc(m.author.username)}</a>${roleTag(m.author.role)}</aside>
        <div class="content"><div class="meta muted">${fmt(m.created_at)}</div><div class="body">${esc(m.body)}</div></div></article>`).join('');
    let reply;
    if (state.me.banned) reply = '<div class="panel muted">Аккаунт заблокирован. Писать нельзя.</div>';
    else if (tk.status === 'closed' && !isSupport()) reply = '<div class="panel muted">Тикет закрыт.</div>';
    else reply = `<form class="panel form" data-form="ticket-reply" data-ticket="${tk.id}">
        <label>Ответ<textarea name="body" rows="5" required maxlength="5000"></textarea></label>
        <button class="btn" type="submit">Ответить</button></form>`;
    render(`<div class="crumbs"><a href="#/tickets">Тикеты</a> / #${tk.id}</div>
      <h1>${esc(tk.subject)} ${ticketStatus(tk.status)}</h1>
      <div class="muted">От ${esc(tk.author.username)} · ${fmt(tk.created_at)}</div>
      ${statusBtns}${list}${reply}`);
  }

  // ---------- личные сообщения ----------
  async function viewMessages() {
    if (!state.me) return needLogin('/messages');
    const { data, error } = await sb.from('direct_messages')
      .select('id, sender_uid, recipient_uid, body, created_at, sender:profiles!sender_uid(uid, username, avatar_url), recipient:profiles!recipient_uid(uid, username, avatar_url)')
      .order('id', { ascending: false }).limit(300);
    if (error) throw error;
    const seen = new Map();
    for (const m of data) {
      const partner = m.sender_uid === state.me.uid ? m.recipient : m.sender;
      if (!seen.has(partner.uid)) seen.set(partner.uid, { partner, last: m });
    }
    const rows = [...seen.values()].map(({ partner, last }) => `<a class="row" href="#/messages/${partner.uid}">
        <div class="avatar-wrap">${avatarHtml(partner, 'avatar-xs')}</div>
        <div class="grow"><div class="row-title">${esc(partner.username)}</div>
        <div class="muted">${esc(last.body.slice(0, 80))}</div></div>
        <div class="stat muted">${fmt(last.created_at)}</div></a>`).join('');
    render(`<h1>Сообщения</h1>
      <div class="panel">${rows || '<div class="row muted">Диалогов пока нет. Откройте профиль участника и нажмите «Написать».</div>'}</div>`);
  }

  async function viewDialog(uid) {
    if (!state.me) return needLogin(`/messages/${uid}`);
    if (uid === state.me.uid) return goto('#/messages');
    const [p, msgs] = await Promise.all([
      sb.from('profiles').select('uid, username, avatar_url').eq('uid', uid).maybeSingle(),
      sb.from('direct_messages').select('id, sender_uid, body, created_at')
        .or(`and(sender_uid.eq.${state.me.uid},recipient_uid.eq.${uid}),and(sender_uid.eq.${uid},recipient_uid.eq.${state.me.uid})`)
        .order('id', { ascending: false }).limit(100),
    ]);
    if (p.error) throw p.error;
    if (msgs.error) throw msgs.error;
    if (!p.data) return notFound();
    const list = msgs.data.slice().reverse().map((m) => {
      const mine = m.sender_uid === state.me.uid;
      return `<div class="chat-msg ${mine ? 'mine' : ''}"><div class="chat-main">
        <span class="chat-name">${mine ? 'Вы' : esc(p.data.username)}</span> <span class="muted">${fmt(m.created_at)}</span>
        <div class="chat-body">${esc(m.body)}</div></div></div>`;
    }).join('') || '<div class="muted">Сообщений пока нет.</div>';
    const form = state.me.banned
      ? '<div class="muted">Аккаунт заблокирован: писать нельзя.</div>'
      : `<form class="chat-form" data-form="dm" data-to="${uid}"><input name="body" maxlength="1000" required placeholder="Личное сообщение" autocomplete="off"><button class="btn" type="submit">Отправить</button></form>`;
    render(`<div class="crumbs"><a href="#/messages">Сообщения</a> / ${esc(p.data.username)}</div>
      <h1>Диалог с ${esc(p.data.username)}</h1>
      <div class="panel chat"><div class="chat-box" id="dm-box">${list}</div>${form}</div>`);
    const box = document.getElementById('dm-box');
    if (box) box.scrollTop = box.scrollHeight;
  }

  // ---------- маршрутизация ----------
  const ROUTES = [
    [/^\/$/, viewIndex],
    [/^\/c\/(\d+)$/, (m) => viewCategory(Number(m[1]))],
    [/^\/c\/(\d+)\/new$/, (m) => viewNewThread(Number(m[1]))],
    [/^\/t\/(\d+)$/, (m) => viewThread(Number(m[1]))],
    [/^\/u\/(\d+)$/, (m) => viewProfile(Number(m[1]))],
    [/^\/login$/, viewLogin],
    [/^\/register$/, viewRegister],
    [/^\/admin$/, viewAdmin],
    [/^\/tickets$/, viewTickets],
    [/^\/tickets\/new$/, viewNewTicket],
    [/^\/tickets\/(\d+)$/, (m) => viewTicket(Number(m[1]))],
    [/^\/messages$/, viewMessages],
    [/^\/messages\/(\d+)$/, (m) => viewDialog(Number(m[1]))],
  ];

  let routeToken = 0;
  async function route() {
    const token = ++routeToken;
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    for (const [re, handler] of ROUTES) {
      const m = path.match(re);
      if (!m) continue;
      try {
        await handler(m, params);
      } catch (err) {
        if (token === routeToken) render(`<div class="panel empty"><h1>Ошибка</h1><p>${esc(friendlyError(err))}</p></div>`);
      }
      return;
    }
    notFound();
  }

  // ---------- действия (кнопки) ----------
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    const d = el.dataset;
    try {
      if (d.action === 'logout') {
        await sb.auth.signOut();
        state.me = null;
        renderNav();
        flash('Вы вышли.');
        return goto('#/');
      }
      if (d.action === 'thread-mod') {
        await rpc('mod_thread', { p_thread: Number(d.thread), p_action: d.mod });
        flash('Готово.');
      } else if (d.action === 'thread-delete') {
        if (!confirm('Удалить тред целиком?')) return;
        await rpc('delete_thread', { p_thread: Number(d.thread) });
        flash('Тред удалён.');
        return goto(`#/c/${d.category}`);
      } else if (d.action === 'post-delete') {
        if (!confirm('Удалить сообщение?')) return;
        await rpc('delete_post', { p_post: Number(d.post) });
        flash('Сообщение удалено.');
      } else if (d.action === 'create-invite') {
        const code = await rpc('create_invite');
        flash(`Инвайт создан: ${code}`);
      } else if (d.action === 'ticket-status') {
        await rpc('set_ticket_status', { p_ticket: Number(d.ticket), p_status: d.status });
        flash('Статус изменён.');
      } else if (d.action === 'chat-clear') {
        if (!confirm('Очистить общий чат?')) return;
        await rpc('clear_chat');
        flash('Чат очищен.');
      } else if (d.action === 'set-ban') {
        await rpc('set_ban', { p_uid: Number(d.uid), p_banned: d.banned === 'true' });
        flash(d.banned === 'true' ? 'Пользователь заблокирован.' : 'Пользователь разблокирован.');
      } else if (d.action === 'set-role') {
        await rpc('set_role', { p_uid: Number(d.uid), p_role: d.role });
        flash('Роль изменена.');
      }
      await route();
    } catch (err) {
      flash(friendlyError(err));
      await route();
    }
  });

  // ---------- формы ----------
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    const kind = f.dataset.form;
    if (!kind) return;
    e.preventDefault();
    const v = (name) => (f.elements[name]?.value ?? '').trim();
    try {
      if (kind === 'login') {
        const username = v('username');
        const password = f.elements.password.value;
        const { error } = USERNAME_RE.test(username)
          ? await sb.auth.signInWithPassword({ email: emailFor(username), password })
          : { error: new Error('x') };
        if (error) throw new Error(/banned/i.test(error.message) ? 'Аккаунт заблокирован.' : 'Неверный ник или пароль.');
        await loadMe();
        renderNav();
        flash('Вы вошли.');
        return goto('#' + safeNext(f.dataset.next));
      }

      if (kind === 'register') {
        const invite = v('invite').toUpperCase();
        const username = v('username');
        const password = f.elements.password.value;
        const password2 = f.elements.password2.value;
        if (!USERNAME_RE.test(username)) throw new Error('Ник: 3–20 символов, латиница, цифры и _.');
        if (password.length < 8) throw new Error('Пароль: минимум 8 символов.');
        if (password !== password2) throw new Error('Пароли не совпадают.');
        const valid = await rpc('check_invite', { p_code: invite });
        if (!valid) throw new Error('Инвайт-код недействителен или уже использован.');
        const { data, error } = await sb.auth.signUp({
          email: emailFor(username), password, options: { data: { username, invite } },
        });
        if (error) throw error;
        if (!data.session) throw new Error('В Supabase отключите подтверждение email (см. README).');
        await loadMe();
        renderNav();
        flash(`Добро пожаловать! Ваш UID: ${state.me?.uid ?? '—'}.`);
        return goto('#/');
      }

      if (kind === 'new-thread') {
        const id = await rpc('create_thread', {
          p_category: Number(f.dataset.cat), p_title: v('title'), p_body: v('body'),
        });
        return goto(`#/t/${id}`);
      }

      if (kind === 'reply') {
        await rpc('reply_to_thread', { p_thread: Number(f.dataset.thread), p_body: v('body') });
        flash('Ответ добавлен.');
        return route();
      }

      if (kind === 'new-ticket') {
        const id = await rpc('create_ticket', { p_subject: v('subject'), p_body: v('body') });
        flash('Тикет отправлен.');
        return goto(`#/tickets/${id}`);
      }

      if (kind === 'ticket-reply') {
        await rpc('reply_ticket', { p_ticket: Number(f.dataset.ticket), p_body: v('body') });
        flash('Ответ отправлен.');
        return route();
      }

      if (kind === 'profile') {
        let avatar = v('avatar');
        const file = f.elements.avatarFile?.files?.[0];
        if (file) {
          const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
          if (!types.includes(file.type)) throw new Error('Аватар: только PNG, JPG, GIF или WEBP.');
          if (file.size > 2 * 1024 * 1024) throw new Error('Аватар: файл больше 2 МБ.');
          const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
          const path = `${state.me.uid}/${Date.now()}.${ext}`;
          const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          avatar = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        }
        await rpc('update_profile', { p_avatar: avatar, p_bio: f.elements.bio.value.trim() });
        flash('Профиль сохранён.');
        return route();
      }

      if (kind === 'dm') {
        await rpc('send_dm', { p_to: Number(f.dataset.to), p_body: v('body') });
        return route();
      }

      if (kind === 'chat') {
        await rpc('send_chat_message', { p_body: v('body') });
        f.reset();
        return loadChat();
      }

      if (kind === 'category') {
        await rpc('create_category', {
          p_name: v('name'), p_description: v('description'), p_position: Number(v('position') || 0),
        });
        flash('Раздел создан.');
        return route();
      }
    } catch (err) {
      flash(friendlyError(err));
      await route();
    }
  });

  // ---------- старт ----------
  window.addEventListener('hashchange', route);
  (async () => {
    await loadMe();
    renderNav();
    await route();
  })();
})();
