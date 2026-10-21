/* S-03 タイムライン(F-04, F-05, F-07, F-15) */
(function () {
  const POLL_MS = 30000; // 新着の確認間隔(実装と同じ 30 秒)
  const { h, avatar, toast, counter, validateImage, readDataUrl, PostCard, pagedList } = UI;

  function postForm(onPosted) {
    const me = Store.me();
    const ta = h('textarea', { rows: 3, placeholder: 'いまどうしてる?', 'aria-label': '本文' });
    const cnt = h('span', { class: 'count' });
    const err = h('p', { class: 'error', role: 'alert' });
    const previews = h('div', { class: 'previews' });
    const btn = h('button', { class: 'btn primary', type: 'submit', text: '投稿' });
    const images = []; // { src }
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    const attach = h('button', { class: 'btn', type: 'button', text: '🖼 画像', onclick: () => file.click() });

    function paintPreviews() {
      previews.replaceChildren(...images.map((im, i) => h('div', { class: 'pv' },
        h('img', { src: im.src, alt: '添付画像' }),
        h('button', { class: 'pv-x', type: 'button', 'aria-label': '画像を外す', text: '×', onclick: () => { images.splice(i, 1); paintPreviews(); err.textContent = ''; } }))));
      attach.disabled = images.length >= Store.MAX_IMAGES;
    }

    file.addEventListener('change', async () => {
      err.textContent = '';
      for (const f of Array.from(file.files)) {
        if (images.length >= Store.MAX_IMAGES) { err.textContent = '画像は 4 枚までです'; break; }
        const e = await validateImage(f);
        if (e) { err.textContent = e; continue; }
        images.push({ src: await readDataUrl(f) });
      }
      file.value = '';
      paintPreviews();
    });

    counter(ta, Store.MAX_BODY, cnt, left => {
      btn.disabled = left < 0;
      if (left < 0) err.textContent = '280 文字以内で入力してください';
      else if (err.textContent.startsWith('280')) err.textContent = '';
    });

    const form = h('form', { class: 'panel composer', novalidate: true },
      h('div', { class: 'composer-row' }, avatar(me), ta), previews, err,
      h('div', { class: 'row' }, attach, file, cnt, h('span', { class: 'spacer' }), btn));

    form.addEventListener('submit', e => {
      e.preventDefault();
      const msg = Store.validateBody(ta.value, images.length > 0);
      if (msg) { err.textContent = msg; return; }
      btn.disabled = true; btn.textContent = '送信中…'; // 二重送信防止
      setTimeout(() => {
        const p = Store.createPost(ta.value, images.map(i => i.src));
        if (!Store.storageOk) toast('画像が大きいため、リロードすると消える場合があります');
        ta.value = ''; images.length = 0; err.textContent = '';
        paintPreviews(); ta.dispatchEvent(new Event('input'));
        btn.textContent = '投稿';
        onPosted(p);
      }, 400);
    });
    return form;
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function timeline(app, _params, query) {
    const me = Store.me();
    // 未ログインは「全体」のみ。「フォロー中」を開くとログインへ
    let tab = query.tab === 'all' || !me ? 'all' : 'following';
    const listBox = h('div', { class: 'feed' });
    const bar = h('div', { class: 'new-posts-slot' });

    // 新着の確認に使う状態
    let baseId = 0; // サーバーから受け取った一覧の先頭の投稿 id。自分の投稿では進めない(下記)
    let pending = null; // 見つけた新着 { count, hasMore, items }
    const known = new Set(); // 一覧に出している投稿 id

    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    function paintTabs() {
      tabs.replaceChildren(...[['following', 'フォロー中'], ['all', '全体']].map(([k, label]) => h('button', {
        class: 'tab' + (tab === k ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(tab === k), text: label,
        onclick: () => {
          if (k === 'following' && !UI.requireLogin()) return;
          const same = k === tab;
          tab = k; paintTabs(); load();
          if (same) scrollToTop(); // 表示中のタブをもう一度押すと、最新の状態に更新して先頭へ戻る
        },
      })));
    }

    /** 新着バー。既に一覧にある投稿(自分が投稿したもの)は数えない */
    function paintBar() {
      const items = pending ? pending.items.filter(p => !known.has(p.id)) : [];
      bar.replaceChildren(items.length ? h('button', {
        class: 'new-posts-bar', type: 'button', onclick: showPending,
        text: (pending.hasMore ? items.length + '件以上' : items.length + '件') + 'の新しい投稿を表示',
      }) : '');
    }

    function showPending() {
      const items = pending.items.filter(p => !known.has(p.id));
      if (pending.hasMore) {
        load(); // 件数が多く、一覧との間に欠落ができるので取り直す
      } else {
        const list = listBox.querySelector('.list');
        const empty = list.querySelector('.empty');
        if (empty) empty.remove();
        // 並び順は id 順(新しい順)。自分が先に投稿していれば、新着はその自分の投稿の下に入る
        items.forEach(p => {
          known.add(p.id);
          const before = Array.from(list.children).find(c => Number(c.dataset.id) < p.id);
          list.insertBefore(PostCard(p.id), before || null);
        });
        baseId = Math.max(baseId, ...items.map(p => p.id));
        pending = null;
        paintBar();
      }
      scrollToTop();
    }

    function check() {
      const found = Store.newerThan(tab, baseId);
      pending = found.count > 0 ? found : null;
      paintBar();
    }

    function load() {
      known.clear(); pending = null; paintBar();
      const empty = tab === 'following'
        ? h('div', { class: 'empty' }, h('p', { text: 'ユーザーを探してフォローしよう' }),
          h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: '#/search', text: 'ユーザーを探す' }),
            h('button', { class: 'btn', type: 'button', text: '「全体」タブを見る', onclick: () => { tab = 'all'; paintTabs(); load(); } })))
        : h('div', { class: 'empty' }, h('p', { text: 'まだ投稿がありません' }));
      pagedList(listBox, cursor => {
        const page = Store.timeline(tab, cursor);
        if (!cursor) baseId = page.items.length ? page.items[0].id : 0;
        return page;
      }, p => { known.add(p.id); return PostCard(p.id); }, empty);
    }

    app.append(me ? postForm(p => {
      // 一覧の先頭に足す(いいね数 0、コメント数 0)。「全体」「フォロー中」どちらにも自分の投稿は出る。
      // baseId は進めない: 進めると、自分の投稿の直前に届いた他人の投稿が新着として見つからなくなる
      const list = listBox.querySelector('.list');
      const empty = list && list.querySelector('.empty');
      if (empty) empty.remove();
      known.add(p.id);
      if (list) list.prepend(PostCard(p.id));
      paintBar();
      toast('投稿しました');
    }) : h('div', { class: 'panel muted center' }, h('a', { href: '#/login', text: 'ログイン' }), ' すると投稿・コメント・いいね・フォローができます'),
    tabs, bar, listBox);
    paintTabs();
    load();

    // 30 秒ごとに新着を確認する。画面が隠れている間は確認せず、見える状態に戻ったらすぐ確認する。画面が切り替わったら止める
    const timer = setInterval(() => {
      if (!bar.isConnected) { stop(); return; }
      if (!document.hidden) check();
    }, POLL_MS);
    function onVisibility() {
      if (!bar.isConnected) { stop(); return; }
      if (!document.hidden) check();
    }
    function stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    }
    document.addEventListener('visibilitychange', onVisibility);
  }

  window.Views = Object.assign(window.Views || {}, { timeline });
})();
