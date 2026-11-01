package com.raisetimeline.backend.mapper;

import java.time.OffsetDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.JdbcTemplate;

/** Mapper テストの前提データを、SQL で直接入れる(テスト対象の Mapper に依存しないため)。 */
@TestComponent
public class MapperTestData {

    @Autowired
    JdbcTemplate jdbc;

    public long user(String handle) {
        return user(handle + "@example.com", handle, handle);
    }

    public long user(String email, String handle, String displayName) {
        return jdbc.queryForObject("""
                INSERT INTO users (email, password_hash, handle, display_name)
                VALUES (?, 'hash', ?, ?)
                RETURNING id
                """, Long.class, email, handle, displayName);
    }

    public long post(long userId, String body, OffsetDateTime createdAt) {
        return jdbc.queryForObject("""
                INSERT INTO posts (user_id, body, created_at)
                VALUES (?, ?, ?)
                RETURNING id
                """, Long.class, userId, body, createdAt);
    }

    public long post(long userId, String body) {
        return post(userId, body, OffsetDateTime.now());
    }

    public long comment(long postId, long userId, String body, OffsetDateTime createdAt) {
        return jdbc.queryForObject("""
                INSERT INTO comments (post_id, user_id, body, created_at)
                VALUES (?, ?, ?, ?)
                RETURNING id
                """, Long.class, postId, userId, body, createdAt);
    }

    public void like(long userId, long postId) {
        jdbc.update("INSERT INTO likes (user_id, post_id) VALUES (?, ?)", userId, postId);
    }

    public void follow(long followerId, long followeeId, OffsetDateTime createdAt) {
        jdbc.update("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)",
                followerId, followeeId, createdAt);
    }

    public void follow(long followerId, long followeeId) {
        follow(followerId, followeeId, OffsetDateTime.now());
    }

    public int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }
}
