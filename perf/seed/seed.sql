-- パフォーマンステスト用のシードデータを generate_series で投入する(perf DB 専用)。
-- 規模は psql 変数で変える(未指定は small):
--   small: users=1000  posts=100000   (既定)
--   large: users=10000 posts=1000000
-- 全ユーザーは perf_user_N / perf_user_N@perf.example.test、パスワードは PerfTest1234。
\set ON_ERROR_STOP on
\if :{?users} \else \set users 1000 \endif
\if :{?posts} \else \set posts 100000 \endif
\if :{?follows_per_user} \else \set follows_per_user 60 \endif
SELECT (:posts * 2) AS likes_total, (:posts) AS comments_total \gset

-- 誤爆防止: perf 用 DB 以外には投入しない / スキーマ未作成・データ有りも中断する
DO $$
BEGIN
    IF current_database() <> 'raisetimeline_perf' THEN
        RAISE EXCEPTION 'perf DB(raisetimeline_perf)以外には投入できません: %', current_database();
    END IF;
    IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'スキーマがありません。先にバックエンドを perf DB に向けて 1 度起動し、Flyway を適用してください';
    END IF;
    IF EXISTS (SELECT 1 FROM users) THEN
        RAISE EXCEPTION 'users が空ではありません。先に seed/reset.sql を実行してください';
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users: BCrypt は 1 回だけ計算して全員で使い回す(1 行ずつ計算すると極端に遅い)
WITH h AS MATERIALIZED (SELECT crypt('PerfTest1234', gen_salt('bf', 10)) AS ph)
INSERT INTO users (email, password_hash, handle, display_name, bio)
SELECT 'perf_user_' || g || '@perf.example.test',
       h.ph,
       'perf_user_' || g,
       'Perf User ' || g,
       'performance test user ' || g
FROM generate_series(1, :users) AS g, h
ORDER BY g;

-- follows: フォローされる側に偏りを付ける(power で小さい id ほど人気)
INSERT INTO follows (follower_id, followee_id)
SELECT DISTINCT s.f, s.t
FROM (
    SELECT u AS f, 1 + floor(:users * power(random(), 2))::bigint AS t
    FROM generate_series(1, :users) AS u, generate_series(1, :follows_per_user) AS k
) AS s
WHERE s.f <> s.t;

-- posts: id が大きいほど新しい(30 秒間隔)。投稿者は一様ランダム
INSERT INTO posts (user_id, body, created_at)
SELECT 1 + floor(:users * random())::bigint,
       'perf seed post ' || g || ' ' || md5(g::text) || md5((g * 7)::text),
       now() - ((:posts - g) * interval '30 seconds')
FROM generate_series(1, :posts) AS g
ORDER BY g;

-- likes: 人気の投稿に偏らせる。主キー重複は捨てる
INSERT INTO likes (user_id, post_id, created_at)
SELECT 1 + floor(:users * random())::bigint,
       1 + floor(:posts * power(random(), 1.5))::bigint,
       now() - random() * interval '30 days'
FROM generate_series(1, :likes_total)
ON CONFLICT DO NOTHING;

-- comments
INSERT INTO comments (post_id, user_id, body, created_at)
SELECT 1 + floor(:posts * power(random(), 1.5))::bigint,
       1 + floor(:users * random())::bigint,
       'perf seed comment ' || md5(random()::text),
       now() - random() * interval '30 days'
FROM generate_series(1, :comments_total);

ANALYZE;

SELECT (SELECT count(*) FROM users)    AS users,
       (SELECT count(*) FROM follows)  AS follows,
       (SELECT count(*) FROM posts)    AS posts,
       (SELECT count(*) FROM likes)    AS likes,
       (SELECT count(*) FROM comments) AS comments;
