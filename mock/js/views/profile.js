/* S-05 プロフィール / S-08 フォロー中・フォロワー一覧(F-08, F-18 〜 F-20) */
(function () {
  const { h, avatar, PostCard, UserRow, FollowButton, pagedList } = UI;

  function notFound(app, msg) {
    app.append(h('div', { class: 'panel center' }, h('p', { text: msg }), h('a', { class: 'btn', href: '#/', text: 'ホームへ' })));
  }

  function profile(app, params) {
    const user = Store.userByHandle(params.handle);
    if (!user) return notFound(app, 'ユーザーが見つかりません');
    const me = Store.me();
    const isMe = me && me.id === user.id;

    const stats = h('div', { class: 'stats' });
    function paintStats() {
      stats.replaceChildren(
        h('a', { href: '#/users/' + user.handle + '/following' }, h('b', { text: String(Store.followingCount(user.id)) }), ' フォロー中'),
        h('a', { href: '#/users/' + user.handle + '/followers' }, h('b', { text: String(Store.followerCount(user.id)) }), ' フォロワー'));
    }
    paintStats();

    app.append(h('section', { class: 'panel profile' },
      h('div', { class: 'p-top' }, avatar(user, 'lg'), h('span', { class: 'spacer' }),
        isMe ? h('a', { class: 'btn', href: '#/settings/profile', text: 'プロフィールを編集' }) : FollowButton(user.id, paintStats)),
      h('h1', { class: 'p-name', text: user.displayName }),
      h('p', { class: 'hd', text: '@' + user.handle }),
      user.bio ? h('p', { class: 'bio', text: user.bio }) : null,
      stats));

    const box = h('div', { class: 'feed' });
    app.append(h('h2', { class: 'section', text: '投稿' }), box);
    pagedList(box, cursor => Store.userPosts(user.id, cursor), p => PostCard(p.id),
      h('div', { class: 'empty' }, h('p', { text: 'まだ投稿がありません' })));
  }

  function followList(type) {
    return function (app, params) {
      const user = Store.userByHandle(params.handle);
      if (!user) return notFound(app, 'ユーザーが見つかりません');
      const tabs = h('div', { class: 'tabs' },
        h('a', { class: 'tab' + (type === 'following' ? ' on' : ''), href: '#/users/' + user.handle + '/following', text: 'フォロー中 ' + Store.followingCount(user.id) }),
        h('a', { class: 'tab' + (type === 'followers' ? ' on' : ''), href: '#/users/' + user.handle + '/followers', text: 'フォロワー ' + Store.followerCount(user.id) }));
      const box = h('div', { class: 'panel nopad' });
      app.append(h('a', { class: 'back', href: '#/users/' + user.handle, text: '← ' + user.displayName + ' のプロフィール' }), tabs, box);
      pagedList(box, cursor => Store.followList(user.id, type, cursor), UserRow,
        h('p', { class: 'empty muted', text: type === 'following' ? 'まだ誰もフォローしていません' : 'まだフォロワーはいません' }));
    };
  }

  window.Views = Object.assign(window.Views || {}, { profile, following: followList('following'), followers: followList('followers') });
})();
