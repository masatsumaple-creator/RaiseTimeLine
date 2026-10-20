/* S-03 タイムライン(F-04, F-05, F-07, F-15) */
(function () {
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

  function timeline(app, _params, query) {
    const me = Store.me();
    // 未ログインは「全体」のみ。「フォロー中」を開くとログインへ
    let tab = query.tab === 'all' || !me ? 'all' : 'following';
    const listBox = h('div', { class: 'feed' });

    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    function paintTabs() {
      tabs.replaceChildren(...[['following', 'フォロー中'], ['all', '全体']].map(([k, label]) => h('button', {
        class: 'tab' + (tab === k ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(tab === k), text: label,
        onclick: () => {
          if (k === 'following' && !UI.requireLogin()) return;
          tab = k; paintTabs(); load();
        },
      })));
    }

    function load() {
      const empty = tab === 'following'
        ? h('div', { class: 'empty' }, h('p', { text: 'ユーザーを探してフォローしよう' }),
          h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: '#/search', text: 'ユーザーを探す' }),
            h('button', { class: 'btn', type: 'button', text: '「全体」タブを見る', onclick: () => { tab = 'all'; paintTabs(); load(); } })))
        : h('div', { class: 'empty' }, h('p', { text: 'まだ投稿がありません' }));
      pagedList(listBox, cursor => Store.timeline(tab, cursor), p => PostCard(p.id), empty);
    }

    app.append(me ? postForm(p => {
      // 一覧の先頭に足す(いいね数 0、コメント数 0)。「全体」「フォロー中」どちらにも自分の投稿は出る
      const list = listBox.querySelector('.list');
      const empty = list && list.querySelector('.empty');
      if (empty) empty.remove();
      if (list) list.prepend(PostCard(p.id));
      toast('投稿しました');
    }) : h('div', { class: 'panel muted center' }, h('a', { href: '#/login', text: 'ログイン' }), ' すると投稿・コメント・いいね・フォローができます'),
    tabs, listBox);
    paintTabs();
    load();
  }

  window.Views = Object.assign(window.Views || {}, { timeline });
})();
