-- ユーザー検索(ハンドル・表示名の部分一致)用。部分一致(%語%)は B-tree が効かないので、trigram の GIN を使う
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_handle_trgm ON users USING gin (handle gin_trgm_ops);
CREATE INDEX idx_users_display_name_trgm ON users USING gin (display_name gin_trgm_ops);
