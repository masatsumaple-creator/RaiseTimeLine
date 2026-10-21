package com.raisetimeline.backend.entity;

import java.time.OffsetDateTime;

public class Post {

    private Long id;
    private Long userId;
    private String body;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    // 一覧・詳細取得時に users を JOIN して埋める著者情報
    private String authorHandle;
    private String authorDisplayName;
    private String authorAvatarKey;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getAuthorHandle() {
        return authorHandle;
    }

    public void setAuthorHandle(String authorHandle) {
        this.authorHandle = authorHandle;
    }

    public String getAuthorDisplayName() {
        return authorDisplayName;
    }

    public void setAuthorDisplayName(String authorDisplayName) {
        this.authorDisplayName = authorDisplayName;
    }

    public String getAuthorAvatarKey() {
        return authorAvatarKey;
    }

    public void setAuthorAvatarKey(String authorAvatarKey) {
        this.authorAvatarKey = authorAvatarKey;
    }
}
