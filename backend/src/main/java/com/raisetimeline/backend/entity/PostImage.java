package com.raisetimeline.backend.entity;

/** 投稿に付いた画像 1 枚。imageKey は S3 のキー、sortOrder は表示順(0〜3)。 */
public class PostImage {

    private Long postId;
    private String imageKey;
    private int sortOrder;

    public Long getPostId() {
        return postId;
    }

    public void setPostId(Long postId) {
        this.postId = postId;
    }

    public String getImageKey() {
        return imageKey;
    }

    public void setImageKey(String imageKey) {
        this.imageKey = imageKey;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
