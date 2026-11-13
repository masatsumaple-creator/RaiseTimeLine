-- テスト実行(k6 / Playwright)が作ったデータだけを消し、シード直後の状態へ戻す(perf DB 専用)。
--   * 本文が '[perf-run]' で始まる投稿・コメント(いいね・画像は投稿の削除に連動)
--   * ブラウザテスト用ユーザー perf_browser_*
--   * ログインで発行されたリフレッシュトークン(シードには無い)
-- いいね・フォローは各テスト内で付けて外す(差し引き 0)ので、ここでは触らない。
\set ON_ERROR_STOP on
DO $$
BEGIN
    IF current_database() <> 'raisetimeline_perf' THEN
        RAISE EXCEPTION 'perf DB(raisetimeline_perf)以外では実行できません: %', current_database();
    END IF;
END $$;

DELETE FROM comments WHERE body LIKE '[perf-run]%';
DELETE FROM posts WHERE body LIKE '[perf-run]%';
DELETE FROM users WHERE handle LIKE 'perf\_browser\_%';
DELETE FROM refresh_tokens;
ANALYZE;
