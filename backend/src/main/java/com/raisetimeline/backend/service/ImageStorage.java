package com.raisetimeline.backend.service;

import java.time.Duration;
import java.util.Optional;

/** 画像の置き場(S3)とのやり取り。画像のバイト列はバックエンドを通さず、署名付き URL でブラウザと S3 が直接やり取りする。 */
public interface ImageStorage {

    /** アップロード用の署名付き URL(PUT)。contentType と size(バイト)が違うリクエストは S3 が拒否する。 */
    String presignUpload(String key, String contentType, long size, Duration expiration);

    /** 表示用の署名付き URL(GET)。 */
    String presignGet(String key, Duration expiration);

    /** オブジェクトの情報。無ければ empty。 */
    Optional<StoredObject> head(String key);

    /** オブジェクトの先頭 length バイト(ファイルの種類の確認に使う)。 */
    byte[] readHead(String key, int length);

    /** オブジェクトを消す。無くてもエラーにしない。 */
    void delete(String key);

    record StoredObject(long size, String contentType) {
    }
}
