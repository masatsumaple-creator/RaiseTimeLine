/* S-01 ログイン / S-02 新規登録 / S-06 プロフィール編集 */
(function () {
  const { h, avatar, toast, counter, validateImage, readDataUrl } = UI;

  function field(label, input, hint) {
    const err = h('p', { class: 'error', role: 'alert' });
    return {
      err,
      el: h('label', { class: 'field' }, h('span', { class: 'lbl', text: label }), input,
        hint ? h('span', { class: 'hint', text: hint }) : null, err),
    };
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 送信中はボタンを無効化して二重送信を防ぐ(Mockでは短い待ち時間で通信を再現)
  function submitting(btn, fn) {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '送信中…';
    setTimeout(() => { btn.disabled = false; btn.textContent = label; fn(); }, 350);
  }

  function afterLogin() {
    const to = Router.returnTo || '#/';
    Router.returnTo = null;
    Router.go(to);
  }

  /* ---- S-01 ログイン ---- */
  function login(app) {
    const email = h('input', { type: 'email', autocomplete: 'username', maxlength: 255 });
    const pw = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 64 });
    const fe = field('メールアドレス', email);
    const fp = field('パスワード', pw);
    const formErr = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn primary block', type: 'submit', text: 'ログイン' });

    const form = h('form', { class: 'panel auth', novalidate: true }, h('h1', { text: 'ログイン' }), fe.el, fp.el, formErr, btn,
      h('p', { class: 'muted center' }, 'アカウントをお持ちでない方は ', h('a', { href: '#/signup', text: '新規登録' })),
      h('p', { class: 'demo' }, 'テスト用: tamura@example.com / password1(newbie@example.com はフォロー0人)'));

    form.addEventListener('submit', e => {
      e.preventDefault();
      fe.err.textContent = fp.err.textContent = formErr.textContent = '';
      if (!EMAIL_RE.test(email.value.trim())) fe.err.textContent = 'メールアドレスの形式が正しくありません';
      if (!pw.value) fp.err.textContent = 'パスワードを入力してください';
      if (fe.err.textContent || fp.err.textContent) return;
      submitting(btn, () => {
        if (!Store.login(email.value, pw.value)) {
          // どちらが違うかは示さない
          formErr.textContent = 'メールアドレスまたはパスワードが正しくありません';
          return;
        }
        afterLogin();
      });
    });
    app.append(form);
    email.focus();
  }

  /* ---- S-02 新規登録 ---- */
  function signup(app) {
    const email = h('input', { type: 'email', autocomplete: 'email', maxlength: 255 });
    const pw = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 70 });
    const name = h('input', { type: 'text', maxlength: 60 });
    const handle = h('input', { type: 'text', autocapitalize: 'none', maxlength: 40 });
    const fe = field('メールアドレス', email);
    const fp = field('パスワード', pw, '8〜64 文字、英字と数字を含める');
    const fn = field('表示名', name, '1〜50 文字');
    const fh = field('ユーザーハンドル', handle, '@ なしで入力。半角英数字と _ の 3〜30 文字');
    const btn = h('button', { class: 'btn primary block', type: 'submit', text: '登録する' });
    const form = h('form', { class: 'panel auth', novalidate: true }, h('h1', { text: '新規登録' }), fe.el, fp.el, fn.el, fh.el, btn,
      h('p', { class: 'muted center' }, 'アカウントをお持ちの方は ', h('a', { href: '#/login', text: 'ログイン' })));

    form.addEventListener('submit', e => {
      e.preventDefault();
      [fe, fp, fn, fh].forEach(f => { f.err.textContent = ''; });
      let bad = false;
      const fail = (f, m) => { f.err.textContent = m; bad = true; };
      const em = email.value.trim();
      if (!EMAIL_RE.test(em) || em.length > 255) fail(fe, 'メールアドレスの形式が正しくありません');
      const p = pw.value;
      if (p.length < 8 || p.length > 64 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) fail(fp, 'パスワードは 8〜64 文字で、英字と数字を含めてください');
      const dn = name.value.trim();
      if (Store.len(dn) < 1 || Store.len(dn) > 50) fail(fn, '表示名は 1〜50 文字で入力してください');
      const hd = handle.value.trim().replace(/^@/, '');
      if (!/^[A-Za-z0-9_]{3,30}$/.test(hd)) fail(fh, 'ユーザーハンドルは半角英数字と _ の 3〜30 文字で入力してください');
      if (bad) return;
      submitting(btn, () => {
        if (Store.emailTaken(em)) fail(fe, 'このメールアドレスは登録済みです');
        if (Store.handleTaken(hd)) fail(fh, 'このハンドルは使われています');
        if (bad) return;
        Store.signup({ email: em, password: p, displayName: dn, handle: hd });
        toast('登録しました');
        afterLogin();
      });
    });
    app.append(form);
    email.focus();
  }

  /* ---- S-06 プロフィール編集(F-03 / F-17) ---- */
  function profileEdit(app) {
    const me = Store.me();
    const name = h('input', { type: 'text', maxlength: 80, value: me.displayName });
    const bio = h('textarea', { rows: 4 });
    bio.value = me.bio || '';
    const fn = field('表示名', name, '1〜50 文字');
    const bioCount = h('span', { class: 'count' });
    const bioErr = h('p', { class: 'error', role: 'alert' });
    let newAvatar; // undefined = 変更なし
    const preview = h('div', { class: 'avatar-preview' });
    const avErr = h('p', { class: 'error', role: 'alert' });
    const paint = () => preview.replaceChildren(avatar({ ...me, avatar: newAvatar !== undefined ? newAvatar : me.avatar }, 'lg'));
    paint();
    const file = h('input', {
      type: 'file', accept: 'image/jpeg,image/png,image/webp', onchange: async () => {
        avErr.textContent = '';
        const f = file.files[0];
        if (!f) return;
        const err = await validateImage(f);
        if (err) { avErr.textContent = err; file.value = ''; return; }
        newAvatar = await readDataUrl(f);
        paint();
      },
    });
    const btn = h('button', { class: 'btn primary', type: 'submit', text: '保存' });
    counter(bio, Store.MAX_BIO, bioCount, left => { bioErr.textContent = left < 0 ? '自己紹介は 160 文字以内で入力してください' : ''; btn.disabled = left < 0; });

    const form = h('form', { class: 'panel', novalidate: true }, h('h1', { text: 'プロフィール編集' }),
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'アイコン画像' }), preview, file,
        h('span', { class: 'hint', text: 'JPEG / PNG / WebP、5MB まで' }), avErr),
      fn.el,
      h('div', { class: 'field' }, h('span', { class: 'lbl', text: '自己紹介' }), bio, h('div', { class: 'row' }, bioCount), bioErr),
      h('div', { class: 'row end' }, h('a', { class: 'btn', href: '#/users/' + me.handle, text: 'キャンセル' }), btn));

    form.addEventListener('submit', e => {
      e.preventDefault();
      fn.err.textContent = '';
      const dn = name.value.trim();
      if (Store.len(dn) < 1 || Store.len(dn) > 50) { fn.err.textContent = '表示名は 1〜50 文字で入力してください'; return; }
      if (Store.len(bio.value) > Store.MAX_BIO) return;
      submitting(btn, () => {
        Store.updateProfile({ displayName: dn, bio: bio.value, avatar: newAvatar });
        toast('プロフィールを保存しました');
        Router.go('#/users/' + me.handle);
      });
    });
    app.append(form);
  }

  window.Views = Object.assign(window.Views || {}, { login, signup, profileEdit });
})();
