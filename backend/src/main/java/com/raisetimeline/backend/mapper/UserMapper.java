package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.User;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper {

    void insert(User user);

    boolean existsByEmail(@Param("email") String email);

    boolean existsByHandle(@Param("handle") String handle);

    User findByEmail(@Param("email") String email);

    /** ハンドルは大文字小文字を区別せず一致させる。無ければ null。 */
    User findByHandle(@Param("handle") String handle);

    /**
     * ハンドルまたは表示名の部分一致。先頭が一致するユーザーを上に、その中ではハンドルの昇順。
     * パターンは LIKE の特殊文字をエスケープ済みで、エスケープ文字は円記号(\)。メールと自己紹介は対象にしない。
     */
    List<User> search(
            @Param("containsPattern") String containsPattern,
            @Param("prefixPattern") String prefixPattern,
            @Param("limit") int limit,
            @Param("offset") int offset);

    User findById(@Param("id") Long id);
}
