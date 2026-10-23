package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.User;
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

    User findById(@Param("id") Long id);
}
