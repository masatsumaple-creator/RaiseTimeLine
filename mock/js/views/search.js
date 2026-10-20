/* S-07 ユーザー検索(F-21, F-22) */
(function () {
  const { h, UserRow, pagedList } = UI;

  function search(app, _params, query) {
    const input = h('input', { type: 'search', placeholder: '@ハンドルまたは表示名', 'aria-label': 'ユーザー検索', value: query.q || '' });
    const result = h('div', { class: 'panel nopad' });
    let timer;

    function run() {
      const q = input.value.trim();
      if (!q) { // 空文字では検索しない
        result.replaceChildren(h('p', { class: 'empty muted', text: 'ユーザーを検索してフォローしましょう' }));
        return;
      }
      pagedList(result, cursor => Store.searchUsers(q, cursor), UserRow,
        h('p', { class: 'empty muted', text: '見つかりませんでした' }));
    }

    // 入力を止めて 300ms 後、または Enter で検索
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
    const form = h('form', { class: 'panel', onsubmit: e => { e.preventDefault(); clearTimeout(timer); run(); } }, input);
    app.append(h('h1', { class: 'section', text: 'ユーザー検索' }), form, result);
    run();
    input.focus();
  }

  window.Views = Object.assign(window.Views || {}, { search });
})();
