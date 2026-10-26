package com.raisetimeline.backend.entity;

import java.time.OffsetDateTime;

/** フォロー中 / フォロワー一覧の 1 行。followedAt は、そのフォローが作られた日時(カーソルに使う)。 */
public class FollowEntry implements ListedUser {

    private Long id;
    private String handle;
    private String displayName;
    private String bio;
    private String avatarKey;
    private OffsetDateTime followedAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getHandle() {
        return handle;
    }

    public void setHandle(String handle) {
        this.handle = handle;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public String getAvatarKey() {
        return avatarKey;
    }

    public void setAvatarKey(String avatarKey) {
        this.avatarKey = avatarKey;
    }

    public OffsetDateTime getFollowedAt() {
        return followedAt;
    }

    public void setFollowedAt(OffsetDateTime followedAt) {
        this.followedAt = followedAt;
    }
}
