/* 状態操作。いいね数・コメント数などは列として持たず、都度数える(要件定義書 7 章) */
(function () {
  const PAGE = 20;
  const MAX_NEW = 50; // 新着として一度に返す最大件数
  const MAX_BODY = 280;
  const MAX_BIO = 160;
  const MAX_IMAGES = 4;
  const MAX_SIZE = 5 * 1024 * 1024;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  let S = Data.load();
  const persist = () => Data.save(S);

  // 文字数はコードポイント数で数える(絵文字・日本語も 1 文字)
  const len = (s) => Array.from(s || '').length;
  const lc = (s) => (s || '').toLowerCase();

  function page(list, cursorIndex) {
    const start = cursorIndex || 0;
    const items = list.slice(start, start + PAGE);
    const next = start + PAGE < list.length ? start + PAGE : null;
    return { items, nextCursor: next };
  }

  // 投稿一覧用: (createdAt, id) 降順のカーソル。OFFSET ではないので途中で投稿が増えても重複しない
  function postPage(posts, cursor) {
    const sorted = posts.slice().sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
    let list = sorted;
    if (cursor) {
      const [c, i] = cursor.split('_').map(Number);
      list = sorted.filter(p => p.createdAt < c || (p.createdAt === c && p.id < i));
    }
    const items = list.slice(0, PAGE);
    const last = items[items.length - 1];
    return { items, nextCursor: list.length > PAGE ? last.createdAt + '_' + last.id : null };
  }

  const Store = {
    PAGE, MAX_NEW, MAX_BODY, MAX_BIO, MAX_IMAGES, MAX_SIZE, TYPES, len,
    persist,
    reset() { S = Data.reset(); },
    storageOk: true,

    /* ---- セッション ---- */
    me() { return S.session ? Store.user(S.session) : null; },
    user(id) { return S.users.find(u => u.id === id) || null; },
    userByHandle(h) { return S.users.find(u => lc(u.handle) === lc(h)) || null; },

    login(email, password) {
      const u = S.users.find(x => lc(x.email) === lc(email.trim()));
      if (!u || u.password !== password) return null;
      S.session = u.id; persist();
      return u;
    },
    logout() { S.session = null; persist(); },
    signup(f) {
      const u = {
        id: S.nextIds.user++, email: f.email.trim(), password: f.password, handle: f.handle,
        displayName: f.displayName.trim(), bio: '', avatar: null, createdAt: Date.now(),
      };
      S.users.push(u); S.session = u.id; persist();
      return u;
    },
    emailTaken(email) { return S.users.some(u => lc(u.email) === lc(email.trim())); },
    handleTaken(h) { return S.users.some(u => lc(u.handle) === lc(h)); },
    updateProfile(fields) {
      const u = Store.me();
      u.displayName = fields.displayName.trim();
      u.bio = fields.bio;
      if (fields.avatar !== undefined) u.avatar = fields.avatar;
      persist();
      return u;
    },

    /* ---- 件数・状態 ---- */
    likeCount: (pid) => S.likes.filter(l => l.postId === pid).length,
    commentCount: (pid) => S.comments.filter(c => c.postId === pid).length,
    likedByMe: (pid) => !!S.session && S.likes.some(l => l.postId === pid && l.userId === S.session),
    followerCount: (uid) => S.follows.filter(f => f.followee === uid).length,
    followingCount: (uid) => S.follows.filter(f => f.follower === uid).length,
    isFollowing: (uid) => !!S.session && S.follows.some(f => f.follower === S.session && f.followee === uid),

    /* ---- 投稿 ---- */
    post: (id) => S.posts.find(p => p.id === id) || null,
    /** タブに表示する投稿(フォロー中は、自分とフォロー先の投稿) */
    tabPosts(tab) {
      if (tab !== 'following') return S.posts;
      const me = S.session;
      const ids = new Set(S.follows.filter(f => f.follower === me).map(f => f.followee));
      ids.add(me);
      return S.posts.filter(p => ids.has(p.userId));
    },
    timeline(tab, cursor) {
      return postPage(Store.tabPosts(tab), cursor);
    },
    /**
     * sinceId(一覧の先頭の投稿 id)より新しい投稿を、新しい順に最大 MAX_NEW 件。
     * 超える場合は hasMore が true(一覧との間に欠落ができるので、画面は一覧を取り直す)。
     * 時刻ではなく id で判定する(id は単調に増える)。
     */
    newerThan(tab, sinceId) {
      const rows = Store.tabPosts(tab).filter(p => p.id > sinceId).sort((a, b) => b.id - a.id);
      const items = rows.slice(0, MAX_NEW);
      return { count: items.length, hasMore: rows.length > MAX_NEW, items };
    },
    /** デモ用: 自分以外のユーザー(いればフォロー先)が投稿したことにする。新着バーの確認に使う */
    createPostAsOther() {
      const others = S.users.filter(u => u.id !== S.session && u.id !== 8);
      const followed = others.filter(u => S.follows.some(f => f.follower === S.session && f.followee === u.id));
      const pool = followed.length ? followed : others;
      const user = pool[Math.floor(Math.random() * pool.length)];
      const bodies = Data.BODIES;
      const p = {
        id: S.nextIds.post++, userId: user.id, body: bodies[Math.floor(Math.random() * bodies.length)],
        createdAt: Date.now(), editedAt: null, images: [],
      };
      S.posts.push(p); persist();
      return { post: p, user };
    },
    userPosts(uid, cursor) { return postPage(S.posts.filter(p => p.userId === uid), cursor); },

    validateBody(body, hasImages) {
      const t = (body || '').trim();
      if (!t && !hasImages) return '本文または画像を入れてください';
      if (len(t) > MAX_BODY) return '280 文字以内で入力してください';
      return null;
    },
    createPost(body, images) {
      const p = {
        id: S.nextIds.post++, userId: S.session, body: (body || '').trim() || null,
        createdAt: Date.now(), editedAt: null, images: images.slice(),
      };
      S.posts.push(p); Store.storageOk = persist();
      return p;
    },
    /** 本文だけ編集。変更が無ければ updated_at を変えない */
    updatePost(id, body) {
      const p = Store.post(id);
      if (!p) return { error: '投稿が見つかりません', gone: true };
      if (p.userId !== S.session) return { error: '他人の投稿は編集できません' };
      const t = (body || '').trim();
      const err = Store.validateBody(t, p.images.length > 0);
      if (err) return { error: err };
      if (t !== (p.body || '')) { p.body = t || null; p.editedAt = Date.now(); persist(); }
      return { post: p };
    },
    deletePost(id) {
      const p = Store.post(id);
      if (!p || p.userId !== S.session) return false;
      S.posts = S.posts.filter(x => x.id !== id);
      S.comments = S.comments.filter(c => c.postId !== id); // 連動削除
      S.likes = S.likes.filter(l => l.postId !== id);
      persist();
      return true;
    },

    /* ---- いいね ---- */
    toggleLike(pid) {
      const i = S.likes.findIndex(l => l.postId === pid && l.userId === S.session);
      if (i >= 0) S.likes.splice(i, 1);
      else S.likes.push({ userId: S.session, postId: pid, createdAt: Date.now() });
      persist();
    },

    /* ---- コメント ---- */
    comments(pid, cursor) {
      const list = S.comments.filter(c => c.postId === pid).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
      return page(list, cursor);
    },
    addComment(pid, body) {
      const c = { id: S.nextIds.comment++, postId: pid, userId: S.session, body: body.trim(), createdAt: Date.now() };
      S.comments.push(c); persist();
      return c;
    },
    deleteComment(id) {
      const c = S.comments.find(x => x.id === id);
      if (!c || c.userId !== S.session) return false;
      S.comments = S.comments.filter(x => x.id !== id); persist();
      return true;
    },

    /* ---- フォロー ---- */
    toggleFollow(uid) {
      if (uid === S.session) return; // 自分自身はフォローできない(DB の CHECK 制約に相当)
      const i = S.follows.findIndex(f => f.follower === S.session && f.followee === uid);
      if (i >= 0) S.follows.splice(i, 1);
      else S.follows.push({ follower: S.session, followee: uid, createdAt: Date.now() });
      persist();
    },
    followList(uid, type, cursor) {
      const rows = type === 'following'
        ? S.follows.filter(f => f.follower === uid).map(f => f.followee)
        : S.follows.filter(f => f.followee === uid).map(f => f.follower);
      const users = rows.map(Store.user).filter(Boolean)
        .sort((a, b) => lc(a.handle) < lc(b.handle) ? -1 : 1);
      return page(users, cursor);
    },

    /* ---- ユーザー検索(部分一致、前方一致を上位) ---- */
    searchUsers(q, cursor) {
      const k = lc(q.trim().replace(/^@/, ''));
      if (!k) return { items: [], nextCursor: null };
      const hit = S.users.filter(u => lc(u.handle).includes(k) || lc(u.displayName).includes(k));
      const pre = (u) => lc(u.handle).startsWith(k) || lc(u.displayName).startsWith(k);
      hit.sort((a, b) => (pre(b) - pre(a)) || (lc(a.handle) < lc(b.handle) ? -1 : 1));
      return page(hit, cursor);
    },
  };
  window.Store = Store;
})();
