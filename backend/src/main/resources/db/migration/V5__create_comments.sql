CREATE TABLE comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(280) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- 投稿ごとの一覧(古い順カーソル)と、post_id IN (...) GROUP BY post_id の件数集計用
CREATE INDEX idx_comments_post_created ON comments (post_id, created_at, id);
