package com.raisetimeline.backend.dto;

public record FollowResponse(boolean followedByMe, long followerCount) {
}
