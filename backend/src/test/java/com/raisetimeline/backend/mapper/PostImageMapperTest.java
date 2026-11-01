package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.entity.PostImage;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

@MapperTest
class PostImageMapperTest {

    @Autowired
    PostImageMapper mapper;

    @Autowired
    MapperTestData data;

    long post;
    long other;

    @BeforeEach
    void setUp() {
        long alice = data.user("alice");
        post = data.post(alice, "投稿");
        other = data.post(alice, "別の投稿");
    }

    @Test
    void insertAllは並び順をそのまま表示順として保存する() {
        mapper.insertAll(post, List.of("k/a.png", "k/b.png", "k/c.png"));

        List<PostImage> images = mapper.findByPostIds(List.of(post));

        assertThat(images).extracting(PostImage::getImageKey).containsExactly("k/a.png", "k/b.png", "k/c.png");
        assertThat(images).extracting(PostImage::getSortOrder).containsExactly(0, 1, 2);
        assertThat(images).extracting(PostImage::getPostId).containsOnly(post);
    }

    @Test
    void insertAllは4枚まで保存できるが_5枚目は表示順のCHECK制約で弾かれる() {
        mapper.insertAll(post, List.of("1", "2", "3", "4"));
        assertThat(mapper.findKeysByPostId(post)).hasSize(4);

        assertThatThrownBy(() -> mapper.insertAll(other, List.of("a", "b", "c", "d", "e")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void insertAllは同じ画像キーを別の投稿に使うと一意制約で弾かれる() {
        mapper.insertAll(post, List.of("k/a.png"));

        assertThatThrownBy(() -> mapper.insertAll(other, List.of("k/a.png")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void findByPostIdsは投稿ごと_表示順に返し_画像の無い投稿は含めない() {
        long none = data.post(data.user("bob"), "画像なし");
        mapper.insertAll(other, List.of("o/1.png"));
        mapper.insertAll(post, List.of("p/1.png", "p/2.png"));

        List<PostImage> images = mapper.findByPostIds(List.of(post, other, none));

        assertThat(images).extracting(PostImage::getImageKey).containsExactlyInAnyOrder("p/1.png", "p/2.png", "o/1.png");
        assertThat(images).extracting(PostImage::getPostId).doesNotContain(none);
        assertThat(images.stream().filter(i -> i.getPostId() == post)).extracting(PostImage::getSortOrder)
                .containsExactly(0, 1);
    }

    @Test
    void findKeysByPostIdは表示順にキーを返し_無ければ空() {
        mapper.insertAll(post, List.of("z.png", "a.png"));

        assertThat(mapper.findKeysByPostId(post)).containsExactly("z.png", "a.png");
        assertThat(mapper.findKeysByPostId(other)).isEmpty();
    }

    @Test
    void 投稿を削除すると画像の行も連動して消える() {
        mapper.insertAll(post, List.of("k/a.png"));

        data.jdbc.update("DELETE FROM posts WHERE id = ?", post);

        assertThat(data.count("post_images")).isZero();
    }
}
