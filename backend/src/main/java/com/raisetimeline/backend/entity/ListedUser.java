package com.raisetimeline.backend.entity;

/** 一覧(フォロー中 / フォロワー / 検索結果)の 1 行に出せるユーザーの情報。 */
public interface ListedUser {

    Long getId();

    String getHandle();

    String getDisplayName();

    String getBio();

    String getAvatarKey();
}
