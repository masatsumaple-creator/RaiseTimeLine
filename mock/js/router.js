/* ハッシュルーター + 共通ヘッダー */
(function () {
  const { h, avatar, confirmDialog, toast } = UI;
  const routes = [];

  const Router = {
    returnTo: null, // ログイン後に戻る画面
    add(pattern, view, opts) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      routes.push({ re, keys, view, opts: opts || {} });
    },
    go(hash) {
      if (location.hash === hash) Router.render(); else location.hash = hash;
    },
    parse() {
      const raw = location.hash.replace(/^#/, '') || '/';
      const [path, qs] = raw.split('?');
      const query = {};
      new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
      return { path, query };
    },
    render() {
      const { path, query } = Router.parse();
      const me = Store.me();
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        if (r.opts.guestOnly && me) { Router.go('#/'); return; }
        if (r.opts.auth && !me) { // 未ログインで制限された画面 → ログインへ(ログイン後に戻す)
          Router.returnTo = location.hash;
          Router.go('#/login');
          return;
        }
        renderHeader();
        const app = document.getElementById('app');
        app.replaceChildren();
        window.scrollTo(0, 0);
        r.view(app, params, query);
        return;
      }
      renderHeader();
      document.getElementById('app').replaceChildren(
        h('div', { class: 'panel' }, h('p', { text: 'ページが見つかりません' }), h('a', { href: '#/', text: 'ホームへ' })));
    },
    start() {
      window.addEventListener('hashchange', Router.render);
      Router.render();
    },
  };

  function renderHeader() {
    const me = Store.me();
    const q = h('input', { type: 'search', placeholder: 'ユーザーを検索', 'aria-label': 'ユーザー検索' });
    const nav = h('nav', { class: 'nav' });
    if (me) {
      nav.append(
        h('a', { href: '#/users/' + me.handle, class: 'me', title: '自分のプロフィール' }, avatar(me, 'sm'), h('span', { class: 'me-name', text: me.displayName })),
        h('button', {
          class: 'btn small', type: 'button', text: 'ログアウト', onclick: () => {
            Store.logout(); toast('ログアウトしました'); Router.go('#/login');
          },
        }));
    } else {
      nav.append(h('a', { class: 'btn small', href: '#/login', text: 'ログイン' }), h('a', { class: 'btn small primary', href: '#/signup', text: '新規登録' }));
    }
    const search = me ? h('form', {
      class: 'hsearch', onsubmit: e => {
        e.preventDefault();
        Router.go('#/search' + (q.value.trim() ? '?q=' + encodeURIComponent(q.value.trim()) : ''));
      },
    }, q) : h('span', { class: 'spacer' });

    document.getElementById('header').replaceChildren(
      h('div', { class: 'header-in' }, h('a', { href: '#/', class: 'logo', text: 'RaiseTimeLine' }), search, nav),
      h('div', { class: 'banner' },
        h('span', { text: 'Mock(データはこのブラウザ内のみ・画面確認用)' }),
        // 他のユーザーの投稿を再現する(複数端末の同期が無いので)。タイムラインに 30 秒以内に新着バーが出る
        h('button', {
          class: 'link', type: 'button', text: '他のユーザーの投稿を追加', onclick: () => {
            const { user } = Store.createPostAsOther();
            toast(user.displayName + ' さんが投稿しました(新着バーは 30 秒以内に出ます)');
          },
        }),
        h('button', {
          class: 'link', type: 'button', text: 'データをリセット', onclick: async () => {
            if (!(await confirmDialog('ダミーデータを初期状態に戻します。よろしいですか?', 'リセットする'))) return;
            Store.reset(); toast('初期データに戻しました'); Router.go('#/login');
          },
        })));
  }

  window.Router = Router;
})();
