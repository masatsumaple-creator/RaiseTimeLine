CREATE TABLE posts (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       VARCHAR(280) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_posts_created ON posts (created_at DESC, id DESC);
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC, id DESC);
