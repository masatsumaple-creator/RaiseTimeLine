CREATE TABLE likes (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id));
-- 投稿ごとの件数集計(post_id IN (...) GROUP BY post_id)用
CREATE INDEX idx_likes_post_user ON likes (post_id, user_id);
