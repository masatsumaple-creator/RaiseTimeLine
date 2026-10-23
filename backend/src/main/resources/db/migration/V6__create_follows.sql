CREATE TABLE follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id));
-- フォロワー一覧と件数(followee_id で絞る)用
CREATE INDEX idx_follows_followee ON follows (followee_id, created_at DESC, follower_id DESC);
-- フォロー中一覧と件数(follower_id で絞る)用
CREATE INDEX idx_follows_follower ON follows (follower_id, created_at DESC, followee_id DESC);
