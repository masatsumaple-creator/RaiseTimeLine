/* S-04 投稿詳細(F-09 〜 F-12) */
(function () {
  const { h, avatar, timeAgo, toast, counter, confirmDialog, PostCard, pagedList } = UI;

  function postDetail(app, params, query) {
    const id = Number(params.id);
    if (!Store.post(id)) {
      app.append(h('div', { class: 'panel center' }, h('p', { text: '投稿が見つかりません' }), h('a', { class: 'btn', href: '#/', text: 'ホームへ' })));
      return;
    }
    const me = Store.me();
    const card = PostCard(id, { detail: true, onDelete: () => Router.go('#/') });

    // コメント数はカードの 💬 に出る。コメントの増減のたびに再描画する
    const cardBox = h('div', {}, card);
    const refreshCard = () => cardBox.replaceChildren(PostCard(id, { detail: true, onDelete: () => Router.go('#/') }));

    const listBox = h('div', { class: 'comments' });
    function commentItem(c) {
      const u = Store.user(c.userId);
      const mine = me && me.id === c.userId;
      const el = h('div', { class: 'comment' },
        h('a', { href: '#/users/' + u.handle }, avatar(u, 'sm')),
        h('div', { class: 'c-main' },
          h('div', { class: 'c-head' },
            h('a', { href: '#/users/' + u.handle, class: 'who' }, h('span', { class: 'dn', text: u.displayName }), h('span', { class: 'hd', text: '@' + u.handle })),
            h('span', { class: 'muted', text: '・' + timeAgo(c.createdAt) }),
            mine ? h('span', { class: 'spacer' }) : null,
            mine ? h('button', {
              class: 'link danger-text', type: 'button', text: '削除', onclick: async () => {
                if (!(await confirmDialog('このコメントを削除しますか?'))) return;
                if (Store.deleteComment(c.id)) { el.remove(); refreshCard(); toast('コメントを削除しました'); }
              },
            }) : null),
          h('p', { class: 'body', text: c.body })));
      return el;
    }

    let form;
    if (me) {
      const ta = h('textarea', { id: 'comment-input', rows: 2, placeholder: 'コメントを書く', 'aria-label': 'コメント' });
      const cnt = h('span', { class: 'count' });
      const err = h('p', { class: 'error', role: 'alert' });
      const btn = h('button', { class: 'btn primary', type: 'submit', text: 'コメントする' });
      counter(ta, Store.MAX_BODY, cnt, left => {
        btn.disabled = left < 0;
        err.textContent = left < 0 ? '280 文字以内で入力してください' : '';
      });
      form = h('form', { class: 'panel comment-form', novalidate: true }, ta, err,
        h('div', { class: 'row' }, cnt, h('span', { class: 'spacer' }), btn));
      form.addEventListener('submit', e => {
        e.preventDefault();
        const t = ta.value.trim();
        if (!t) { err.textContent = 'コメントを入力してください'; return; }
        if (Store.len(t) > Store.MAX_BODY) return;
        btn.disabled = true; btn.textContent = '送信中…';
        setTimeout(() => {
          const c = Store.addComment(id, t);
          const list = listBox.querySelector('.list');
          const empty = list.querySelector('.empty');
          if (empty) empty.remove();
          list.append(commentItem(c)); // 一覧の末尾に追加
          refreshCard(); // コメント数 +1
          ta.value = ''; ta.dispatchEvent(new Event('input'));
          btn.textContent = 'コメントする';
        }, 350);
      });
    } else {
      form = h('div', { class: 'panel muted center' }, h('a', { href: '#/login', onclick: () => { Router.returnTo = location.hash; }, text: 'ログイン' }), ' するとコメントできます');
    }

    app.append(h('a', { class: 'back', href: '#/', text: '← タイムラインへ' }), cardBox, form,
      h('h2', { class: 'section', text: 'コメント' }), listBox);
    pagedList(listBox, cursor => Store.comments(id, cursor), commentItem,
      h('p', { class: 'empty muted', text: 'まだコメントはありません' }));

    if (query.focus) { const i = document.getElementById('comment-input'); if (i) i.focus(); }
  }

  window.Views = Object.assign(window.Views || {}, { postDetail });
})();
