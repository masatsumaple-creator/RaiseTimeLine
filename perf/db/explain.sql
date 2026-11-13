-- 主要クエリの実行計画(mapper/*.xml の SQL と同じ形)。perf DB にシードした状態で実行する。
--   ./perf/db.ps1 explain
-- 見るポイント: 大きいテーブル(posts / likes / comments / follows)で Seq Scan が出ていないか、
--   Index Scan / Index Only Scan が使われているか、Buffers の shared read が極端に多くないか。
\set ON_ERROR_STOP on
\set viewer 1
\set author 2
\set term '%perf_user_1%'
\set prefix 'perf_user_1%'

-- 2 ページ目のカーソル(= 新しい順の 20 番目の投稿)と、新着判定の基準 id を用意する
SELECT created_at AS cursor_created_at, id AS cursor_id
FROM posts
ORDER BY created_at DESC, id DESC
OFFSET 19 LIMIT 1 \gset
SELECT max(id) - 5 AS since_id FROM posts \gset

\echo '=== 1. タイムライン(フォロー中)1 ページ目: PostMapper.findPage (followerId) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.user_id, p.body, p.created_at, p.updated_at,
       u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_key AS author_avatar_key
FROM posts p JOIN users u ON u.id = p.user_id
WHERE (p.user_id = :viewer OR p.user_id IN (SELECT f.followee_id FROM follows f WHERE f.follower_id = :viewer))
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;

\echo '=== 2. タイムライン(フォロー中)2 ページ目(カーソル付き) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.user_id, p.body, p.created_at, p.updated_at,
       u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_key AS author_avatar_key
FROM posts p JOIN users u ON u.id = p.user_id
WHERE (p.user_id = :viewer OR p.user_id IN (SELECT f.followee_id FROM follows f WHERE f.follower_id = :viewer))
  AND (p.created_at, p.id) < (:'cursor_created_at', :cursor_id)
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;

\echo '=== 3. タイムライン(全体)1 ページ目 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.user_id, p.body, p.created_at, p.updated_at,
       u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_key AS author_avatar_key
FROM posts p JOIN users u ON u.id = p.user_id
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;

\echo '=== 4. 新着ポーリング: PostMapper.findNewerThan (followerId) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.user_id, p.body, p.created_at, p.updated_at,
       u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_key AS author_avatar_key
FROM posts p JOIN users u ON u.id = p.user_id
WHERE p.id > :since_id
  AND (p.user_id = :viewer OR p.user_id IN (SELECT f.followee_id FROM follows f WHERE f.follower_id = :viewer))
ORDER BY p.id DESC
LIMIT 51;

\echo '=== 5. ユーザーの投稿一覧: PostMapper.findPage (authorId) ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, p.user_id, p.body, p.created_at
FROM posts p JOIN users u ON u.id = p.user_id
WHERE p.user_id = :author
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;

\echo '=== 6. 一覧の件数集計(いいね数・コメント数): 直近 20 件分 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT post_id, count(*) FROM likes
WHERE post_id IN (SELECT id FROM posts ORDER BY created_at DESC, id DESC LIMIT 20)
GROUP BY post_id;

EXPLAIN (ANALYZE, BUFFERS)
SELECT post_id, count(*) FROM comments
WHERE post_id IN (SELECT id FROM posts ORDER BY created_at DESC, id DESC LIMIT 20)
GROUP BY post_id;

\echo '=== 7. コメント一覧(古い順): CommentMapper(コメントが最も多い投稿) ==='
SELECT post_id AS busiest_post FROM comments GROUP BY post_id ORDER BY count(*) DESC LIMIT 1 \gset
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.id, c.post_id, c.user_id, c.body, c.created_at
FROM comments c
WHERE c.post_id = :busiest_post
ORDER BY c.created_at, c.id
LIMIT 20;

\echo '=== 8. ユーザー検索(部分一致): UserMapper.search ==='
\echo '(users が 1,000 件程度だと Seq Scan の方が速いので Seq Scan になる。GIN(pg_trgm)の効きは large シードで確認する)'
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.id, u.handle, u.display_name, u.bio, u.avatar_key
FROM users u
WHERE u.handle ILIKE :'term' ESCAPE '\'
   OR u.display_name ILIKE :'term' ESCAPE '\'
ORDER BY (u.handle ILIKE :'prefix' ESCAPE '\' OR u.display_name ILIKE :'prefix' ESCAPE '\') DESC, u.handle
LIMIT 21 OFFSET 0;

\echo '=== 9. フォロー中 / フォロワー一覧 ==='
EXPLAIN (ANALYZE, BUFFERS)
SELECT f.followee_id, f.created_at FROM follows f
WHERE f.follower_id = :viewer
ORDER BY f.created_at DESC, f.followee_id DESC
LIMIT 21;

EXPLAIN (ANALYZE, BUFFERS)
SELECT f.follower_id, f.created_at FROM follows f
WHERE f.followee_id = 1
ORDER BY f.created_at DESC, f.follower_id DESC
LIMIT 21;
