/* 初期ダミーデータと localStorage の読み書き */
(function () {
  const KEY = 'rtl_mock_v1';

  // 再現性のある疑似乱数(毎回同じダミーデータになる)
  function rng(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  // ダミー画像: グラデーションの SVG(外部URL不要)
  function dummyImage(i, label) {
    const palettes = [
      ['#6ee7b7', '#3b82f6'], ['#fda4af', '#f59e0b'], ['#c4b5fd', '#ec4899'],
      ['#fde68a', '#10b981'], ['#93c5fd', '#8b5cf6'], ['#fca5a5', '#f97316'],
    ];
    const p = palettes[i % palettes.length];
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + p[0] + '"/><stop offset="1" stop-color="' + p[1] + '"/>' +
      '</linearGradient></defs><rect width="640" height="480" fill="url(#g)"/>' +
      '<circle cx="470" cy="140" r="70" fill="rgba(255,255,255,.35)"/>' +
      '<path d="M0 400 L180 250 L300 340 L440 200 L640 380 L640 480 L0 480Z" fill="rgba(255,255,255,.3)"/>' +
      '<text x="24" y="452" font-size="28" font-family="sans-serif" fill="rgba(255,255,255,.9)">' + label + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const BODIES = [
    '今日からRaiseTimeLineを使い始めました。数字を気にせず、ゆるく書いていきます。',
    '朝のコーヒーがおいしい。\n今日も一日がんばろう。',
    'Spring Bootの勉強中。Controller / Service / Repository の分け方がだんだん分かってきた。',
    'ReactのuseStateとuseEffect、最初は混乱したけど手を動かしたら理解できた気がする。',
    '週末は近所の公園まで散歩。桜がちょうど見頃でした。',
    'PostgreSQLのpg_trgm、部分一致検索がこんなに速くなるとは思わなかった。',
    'お昼はカレー。スパイスから作ると香りが全然違う。',
    '「いいね」の数だけ見てしまう癖、ちょっと手放したいな。',
    'S3の署名付きURLの仕組み、図にして整理したらスッキリした。',
    '電車の中で読書。最近は技術書よりエッセイが多い。',
    'テストを書くと設計の粗が見えてくる。面倒だけど大事。',
    '新しいキーボードを買った。打鍵感が最高で、ついつい長文を書いてしまう。',
    '雨の日の午後は、コーヒーとプログラミングに限る。',
    'タイムラインの無限スクロール、カーソル方式にすると重複しないのが気持ちいい。',
    '夕焼けがきれいだった。写真を撮ればよかった。',
    '複数ユーザー前提のデータ設計、多対多の関係がやっと腹落ちした。',
    '今日はお休み。何もしない贅沢を味わっています。',
    'ランニング3km達成。昨日より少し楽になった。',
    '初めてのコメントをもらえてうれしい。ありがとうございます!',
    'CSSのGridとFlexbox、使い分けのコツがつかめてきた。',
    '英語の勉強を再開。まずは毎日5分から。',
    'RDSに接続できた瞬間の達成感。セキュリティグループの設定忘れがちだよね。',
    'リポストもインプレッションも無い世界、思ったより静かで心地いい。',
    '晩ごはんは手作り餃子。皮から作ったら思いのほか大変だった。',
    '読んだ本の感想を書きたいけど、280文字に収めるのが意外と難しい。',
  ];
  const COMMENTS = [
    'いいですね!', 'わかります〜', '参考になりました。', 'おつかれさまです!', 'それ気になってました。',
    '私も同じ経験があります。', 'ありがとうございます。', 'とても共感しました。', '今度試してみます!',
    '素敵な一日になりますように。', 'なるほど、勉強になります。', 'その通りだと思います。',
  ];
  const BIOS = [
    '学習用SNSの開発メンバー。コーヒーと散歩が好き。', 'フロントエンド勉強中です。', 'バックエンドエンジニア志望。Javaが好き。',
    '写真と読書。のんびり更新します。', 'ランニングと料理が趣味です。', 'デザインとコードの間にいます。',
    'インフラ大好き。AWSを触るのが楽しい。', 'はじめまして!登録したばかりです。',
  ];
  const NAMES = [
    ['tamura', '田村 太郎'], ['sato', '佐藤 花子'], ['suzuki', '鈴木 一郎'], ['takahashi', '高橋 美咲'],
    ['ito', '伊藤 健太'], ['watanabe', '渡辺 さくら'], ['yamamoto_dev', '山本 大輔'], ['newbie', '新人ユーザー'],
  ];

  function seed() {
    const r = rng(20261020);
    const now = Date.now();
    const users = NAMES.map((n, i) => ({
      id: i + 1,
      email: n[0].replace('_dev', '') + '@example.com',
      password: 'password1',
      handle: n[0],
      displayName: n[1],
      bio: BIOS[i],
      avatar: null,
      createdAt: now - (60 - i) * 86400000,
    }));

    const follows = [];
    const addF = (a, b) => follows.push({ follower: a, followee: b, createdAt: now - 5 * 86400000 });
    [[1, 2], [1, 3], [1, 4], [2, 1], [2, 5], [3, 1], [5, 1], [5, 2], [6, 1], [7, 1], [7, 4], [4, 6], [6, 7]]
      .forEach(p => addF(p[0], p[1]));

    const posts = [];
    const comments = [];
    const likes = [];
    let pid = 1;
    let cid = 1;
    const posters = [1, 2, 3, 4, 5, 6, 7];
    const COUNT = 52;
    for (let i = 0; i < COUNT; i++) {
      // 新しい投稿ほど後ろに作る(createdAt が昇順になる)
      const createdAt = now - (COUNT - i) * (38 * 60000 + Math.floor(r() * 25 * 60000)) - 3 * 60000;
      const userId = posters[Math.floor(r() * posters.length)];
      const post = {
        id: pid++, userId, body: BODIES[(i * 7 + 3) % BODIES.length], createdAt, editedAt: null, images: [],
      };
      if (i % 5 === 2) {
        const n = i === 22 ? 4 : 1 + (i % 3);
        for (let k = 0; k < n; k++) post.images.push(dummyImage(i + k, 'photo ' + (k + 1)));
      }
      if (i === 17) post.body = null; // 画像だけの投稿
      if (i === 17 && !post.images.length) post.images.push(dummyImage(3, 'photo 1'));
      posts.push(post);

      const nc = Math.floor(r() * 4);
      for (let k = 0; k < nc; k++) {
        comments.push({
          id: cid++, postId: post.id, userId: posters.concat([8])[Math.floor(r() * 8)],
          body: COMMENTS[Math.floor(r() * COMMENTS.length)], createdAt: createdAt + (k + 1) * 9 * 60000,
        });
      }
      const seen = {};
      const nl = Math.floor(r() * 6);
      for (let k = 0; k < nl; k++) {
        const u = 1 + Math.floor(r() * 8);
        if (!seen[u]) { seen[u] = 1; likes.push({ userId: u, postId: post.id, createdAt }); }
      }
    }
    // 編集済みの例
    const ed = posts.find(p => p.userId === 1 && p.body);
    if (ed) { ed.body = ed.body + '(追記しました)'; ed.editedAt = ed.createdAt + 20 * 60000; }

    return { users, posts, comments, likes, follows, nextIds: { user: 9, post: pid, comment: cid }, session: null };
  }

  const Data = {
    BODIES,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* 壊れていたら作り直す */ }
      const s = seed();
      Data.save(s);
      return s;
    },
    save(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        return false; // 容量超過など。画面上の状態はそのまま使える
      }
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      return Data.load();
    },
  };
  window.Data = Data;
})();
