/* 共通部品。ユーザー入力は textContent / DOM 生成だけで描画し、innerHTML には入れない */
(function () {
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach(c => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function timeAgo(ms) {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return 'たった今';
    if (s < 3600) return Math.floor(s / 60) + '分前';
    if (s < 86400) return Math.floor(s / 3600) + '時間前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '日前';
    const d = new Date(ms);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1'];
  function avatar(user, size) {
    const el = h('span', { class: 'avatar' + (size ? ' ' + size : '') });
    if (user.avatar) {
      el.append(h('img', { src: user.avatar, alt: '' }));
    } else {
      el.style.background = COLORS[user.id % COLORS.length];
      el.textContent = Array.from(user.displayName)[0] || '?';
    }
    return el;
  }

  /* ---- トースト・確認ダイアログ・画像拡大 ---- */
  function toast(msg) {
    const t = h('div', { class: 'toast', text: msg });
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), 2600);
  }

  function confirmDialog(message, okLabel) {
    return new Promise(resolve => {
      const dlg = h('dialog', { class: 'dialog' },
        h('p', { text: message }),
        h('div', { class: 'row end' },
          h('button', { class: 'btn', type: 'button', text: 'キャンセル', onclick: () => dlg.close('cancel') }),
          h('button', { class: 'btn danger', type: 'button', text: okLabel || '削除する', onclick: () => dlg.close('ok') })));
      dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
      document.body.append(dlg);
      dlg.showModal();
    });
  }

  function lightbox(src) {
    const dlg = h('dialog', { class: 'lightbox', onclick: () => dlg.close() },
      h('img', { src, alt: '拡大画像' }),
      h('button', { class: 'lb-close', type: 'button', 'aria-label': '閉じる', text: '×' }));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  /* ---- 画像ファイルの検証(形式は拡張子だけでなく中身=マジックナンバーも見る) ---- */
  async function validateImage(file) {
    if (!Store.TYPES.includes(file.type)) return 'JPEG、PNG、WebP の画像を選んでください';
    if (file.size > Store.MAX_SIZE) return '画像は 1 枚 5MB 以下にしてください';
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const ascii = (a, z) => String.fromCharCode(...b.slice(a, z));
    const ok = (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
      (b[0] === 0x89 && ascii(1, 4) === 'PNG') ||
      (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP');
    return ok ? null : 'JPEG、PNG、WebP の画像を選んでください';
  }
  function readDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  /* ---- ログイン必須の操作 ---- */
  function requireLogin() {
    if (Store.me()) return true;
    Router.returnTo = location.hash || '#/';
    toast('ログインが必要です');
    Router.go('#/login');
    return false;
  }

  /* ---- 文字数カウンタ付きの入力欄 ---- */
  function counter(textarea, max, countEl, onChange) {
    const update = () => {
      const left = max - Store.len(textarea.value);
      countEl.textContent = '残り ' + left;
      countEl.classList.toggle('over', left < 0);
      if (onChange) onChange(left);
    };
    textarea.addEventListener('input', update);
    update();
  }

  /* ---- 画像グリッド(最大 4 枚、クリックで拡大) ---- */
  function imageGrid(images) {
    if (!images.length) return null;
    return h('div', { class: 'imgs n' + images.length },
      images.map(src => h('button', {
        class: 'thumb', type: 'button', 'aria-label': '画像を拡大', onclick: () => lightbox(src),
      }, h('img', { src, alt: '投稿画像', loading: 'lazy' }))));
  }

  /* ---- 投稿カード(タイムライン・詳細・プロフィールで共通) ---- */
  function PostCard(postId, opts) {
    opts = opts || {};
    const root = h('article', { class: 'card' + (opts.detail ? ' detail' : '') });
    let editing = false;

    function remove() {
      if (opts.onDelete) opts.onDelete(postId);
      else root.remove();
    }

    function render() {
      const p = Store.post(postId);
      if (!p) { root.replaceChildren(h('p', { class: 'muted', text: '投稿が見つかりません' })); return; }
      const author = Store.user(p.userId);
      const mine = Store.me() && Store.me().id === p.userId;

      const head = h('div', { class: 'card-head' },
        h('a', { href: '#/users/' + author.handle, class: 'who' },
          avatar(author),
          h('span', { class: 'dn', text: author.displayName }),
          h('span', { class: 'hd', text: '@' + author.handle })),
        h('span', { class: 'muted', text: '・' + timeAgo(p.createdAt) }),
        p.editedAt ? h('span', { class: 'edited', text: '編集済み' }) : null,
        mine && !editing ? h('span', { class: 'spacer' }) : null,
        mine && !editing ? h('button', { class: 'link', type: 'button', text: '編集', onclick: () => { editing = true; render(); } }) : null,
        mine && !editing ? h('button', { class: 'link danger-text', type: 'button', text: '削除', onclick: onDelete }) : null);

      let body;
      if (editing) {
        const ta = h('textarea', { rows: 3, 'aria-label': '本文を編集' });
        ta.value = p.body || '';
        const cnt = h('span', { class: 'count' });
        const err = h('p', { class: 'error', role: 'alert' });
        const save = h('button', { class: 'btn primary', type: 'button', text: '保存' });
        counter(ta, Store.MAX_BODY, cnt, left => { save.disabled = left < 0; });
        save.addEventListener('click', () => {
          save.disabled = true;
          const res = Store.updatePost(postId, ta.value);
          if (res.gone) { toast(res.error); remove(); return; }
          if (res.error) { err.textContent = res.error; save.disabled = false; return; }
          editing = false; render();
        });
        body = h('div', { class: 'edit' }, ta, err,
          h('div', { class: 'row' }, cnt, h('span', { class: 'spacer' }),
            h('button', { class: 'btn', type: 'button', text: 'キャンセル', onclick: () => { editing = false; render(); } }), save));
      } else {
        body = p.body ? h('p', { class: 'body', text: p.body }) : null;
      }

      const liked = Store.likedByMe(p.id);
      const foot = h('div', { class: 'card-foot' },
        h('button', {
          class: 'act', type: 'button', 'aria-label': 'コメント', onclick: () => {
            if (opts.detail) { const i = document.getElementById('comment-input'); if (i) i.focus(); }
            else Router.go('#/posts/' + p.id + '?focus=1');
          },
        }, '💬 ', h('span', { text: String(Store.commentCount(p.id)) })),
        h('button', {
          class: 'act like' + (liked ? ' on' : ''), type: 'button', 'aria-pressed': String(liked),
          'aria-label': liked ? 'いいねを取り消す' : 'いいね', onclick: () => {
            if (!requireLogin()) return;
            Store.toggleLike(p.id); render();
          },
        }, liked ? '♥ ' : '♡ ', h('span', { text: String(Store.likeCount(p.id)) })));

      root.replaceChildren(...[head, body, imageGrid(p.images), foot].filter(Boolean));
    }

    async function onDelete() {
      if (!(await confirmDialog('この投稿を削除しますか?コメントといいねも一緒に消えます。'))) return;
      if (Store.deletePost(postId)) { toast('投稿を削除しました'); remove(); }
    }

    // カード本体のクリックで詳細へ(リンク・ボタン・入力欄・画像は除く)
    root.addEventListener('click', e => {
      if (opts.detail || editing || e.target.closest('a,button,textarea,input')) return;
      Router.go('#/posts/' + postId);
    });
    render();
    return root;
  }

  /* ---- ユーザー行(検索結果・フォロー一覧) ---- */
  function FollowButton(userId, onChange) {
    const btn = h('button', { type: 'button' });
    function paint() {
      const on = Store.isFollowing(userId);
      btn.className = 'btn follow' + (on ? ' on' : ' primary');
      btn.textContent = on ? 'フォロー中' : 'フォロー';
      btn.setAttribute('aria-pressed', String(on));
    }
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!requireLogin()) return;
      Store.toggleFollow(userId); paint();
      if (onChange) onChange();
    });
    paint();
    return btn;
  }

  function UserRow(user) {
    const me = Store.me();
    return h('div', { class: 'user-row' },
      h('a', { href: '#/users/' + user.handle, class: 'who' },
        avatar(user),
        h('span', { class: 'names' },
          h('span', { class: 'dn', text: user.displayName }),
          h('span', { class: 'hd', text: '@' + user.handle }))),
      me && me.id === user.id ? null : FollowButton(user.id));
  }

  /* ---- 無限スクロールの一覧: 末尾が画面に近づくと、続きを自動で読み込んで末尾に足す ---- */
  function pagedList(container, fetchPage, renderItem, emptyEl) {
    if (container._stopPaging) container._stopPaging(); // 同じ場所を描き直すときは、前の監視をやめる
    const list = h('div', { class: 'list' });
    const sentinel = h('div', { class: 'more muted', text: '読み込み中…' });
    container.replaceChildren(list, sentinel);
    let count = 0;
    let next = null;

    const observer = new IntersectionObserver(entries => {
      if (!sentinel.isConnected) { observer.disconnect(); return; } // 画面が切り替わった
      if (next != null && entries.some(e => e.isIntersecting)) load(next);
    }, { rootMargin: '300px' });
    container._stopPaging = () => observer.disconnect();

    function load(cursor) {
      const { items, nextCursor } = fetchPage(cursor);
      items.forEach(it => list.append(renderItem(it)));
      count += items.length;
      if (!count && emptyEl) list.append(emptyEl);
      next = nextCursor;
      sentinel.hidden = next == null; // 最後のページまで読んだら、読み込み中の表示も消す
      // 読み込み後も末尾が見えたままなら変化が通知されないので、観察し直して続けて読む
      observer.disconnect();
      if (next != null) observer.observe(sentinel);
    }
    load(null);
    return list;
  }

  window.UI = {
    h, timeAgo, avatar, toast, confirmDialog, lightbox, validateImage, readDataUrl,
    requireLogin, counter, imageGrid, PostCard, FollowButton, UserRow, pagedList,
  };
})();
