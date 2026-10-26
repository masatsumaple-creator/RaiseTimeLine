CREATE TABLE post_images (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id    BIGINT       NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    -- S3 のキー。同じ画像を 2 つの投稿に使えないよう、一意にする
    image_key  VARCHAR(500) NOT NULL UNIQUE,
    -- 表示順(0〜3)。1 投稿に最大 4 枚、同じ位置には 1 枚だけ(post_id での絞り込みにも使う索引になる)
    sort_order SMALLINT     NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (post_id, sort_order)
);
