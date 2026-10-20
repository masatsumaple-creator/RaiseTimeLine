package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.RefreshToken;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface RefreshTokenMapper {

    void insert(RefreshToken token);

    RefreshToken findByHash(@Param("tokenHash") String tokenHash);

    /** 未使用・未失効・期限内のときだけ使用済みにする。更新できたら 1、できなければ 0(同時リクエストの片方だけが 1 になる)。 */
    int markUsedIfActive(@Param("tokenHash") String tokenHash);

    /** 同じ系統のトークンをすべて失効させる。 */
    int revokeFamily(@Param("familyId") String familyId);
}
