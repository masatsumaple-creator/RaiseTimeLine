/* ルート定義(URL は要件定義書 6 章の画面一覧に対応) */
Router.add('/login', Views.login, { guestOnly: true }); // S-01
Router.add('/signup', Views.signup, { guestOnly: true }); // S-02
Router.add('/', Views.timeline); // S-03(未ログインは「全体」のみ閲覧可: 仮)
Router.add('/posts/:id', Views.postDetail); // S-04
Router.add('/users/:handle', Views.profile); // S-05
Router.add('/settings/profile', Views.profileEdit, { auth: true }); // S-06
Router.add('/search', Views.search, { auth: true }); // S-07
Router.add('/users/:handle/following', Views.following); // S-08
Router.add('/users/:handle/followers', Views.followers); // S-08
Router.start();
