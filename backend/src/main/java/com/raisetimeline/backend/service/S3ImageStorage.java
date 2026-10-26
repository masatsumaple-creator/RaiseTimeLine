package com.raisetimeline.backend.service;

import com.raisetimeline.backend.config.S3Properties;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.Optional;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

/**
 * AWS S3 を使う置き場。認証情報は AWS の標準の探し方(環境変数、~/.aws のプロファイル、本番では EC2 のロール)に任せる。
 * クライアントは、最初に使うときまで認証情報を探さないので、S3 を使わない起動やテストでは AWS に触れない。
 */
public class S3ImageStorage implements ImageStorage {

    private static final int NOT_FOUND = 404;

    private final String bucket;
    private final S3Client s3;
    private final S3Presigner presigner;

    public S3ImageStorage(S3Properties properties) {
        Region region = Region.of(properties.region());
        this.bucket = properties.bucket();
        this.s3 = S3Client.builder().region(region).build();
        this.presigner = S3Presigner.builder().region(region).build();
    }

    @Override
    public String presignUpload(String key, String contentType, long size, Duration expiration) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .contentLength(size)
                .build();
        return presigner.presignPutObject(PutObjectPresignRequest.builder()
                        .signatureDuration(expiration)
                        .putObjectRequest(request)
                        .build())
                .url()
                .toString();
    }

    @Override
    public String presignGet(String key, Duration expiration) {
        return presigner.presignGetObject(GetObjectPresignRequest.builder()
                        .signatureDuration(expiration)
                        .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(key).build())
                        .build())
                .url()
                .toString();
    }

    @Override
    public Optional<StoredObject> head(String key) {
        try {
            HeadObjectResponse response = s3.headObject(builder -> builder.bucket(bucket).key(key));
            return Optional.of(new StoredObject(response.contentLength(), response.contentType()));
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        } catch (S3Exception e) {
            // HEAD の応答には本文が無いため、存在しないキーは NoSuchKeyException ではなく 404 の S3Exception になる
            if (e.statusCode() == NOT_FOUND) {
                return Optional.empty();
            }
            throw e;
        }
    }

    @Override
    public byte[] readHead(String key, int length) {
        return s3.getObjectAsBytes(GetObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .range("bytes=0-" + (length - 1))
                        .build())
                .asByteArray();
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(builder -> builder.bucket(bucket).key(key));
    }

    @PreDestroy
    void close() {
        presigner.close();
        s3.close();
    }
}
