package com.raisetimeline.backend;

import com.raisetimeline.backend.service.ImageStorage;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/** テスト用の、メモリ上の置き場(S3 の代わり)。アップロード済みの画像は put で用意し、呼ばれた内容を記録する。 */
public class FakeImageStorage implements ImageStorage {

    public static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1};
    public static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D};
    public static final byte[] WEBP = {'R', 'I', 'F', 'F', 0x10, 0, 0, 0, 'W', 'E', 'B', 'P'};
    public static final byte[] TEXT = "just some text, not an image".getBytes();

    public record Upload(String key, String contentType, long size, Duration expiration) {
    }

    private record Stored(String contentType, byte[] bytes, long size) {
    }

    private final Map<String, Stored> objects = new ConcurrentHashMap<>();
    private final List<Upload> uploads = new CopyOnWriteArrayList<>();
    private final List<String> deleted = new CopyOnWriteArrayList<>();
    private final AtomicInteger presignGetCalls = new AtomicInteger();
    private volatile boolean failDeletes;
    private volatile boolean failPresignGet;

    /** アップロード済みの画像を用意する。size を省略すると、バイト列の長さ。 */
    public void put(String key, String contentType, byte[] bytes) {
        objects.put(key, new Stored(contentType, bytes, bytes.length));
    }

    /** バイト列は短いまま、S3 の情報(HEAD)の大きさだけを偽る(大きい画像の確認用)。 */
    public void putWithSize(String key, String contentType, byte[] bytes, long size) {
        objects.put(key, new Stored(contentType, bytes, size));
    }

    public boolean contains(String key) {
        return objects.containsKey(key);
    }

    public List<Upload> uploads() {
        return new ArrayList<>(uploads);
    }

    public List<String> deleted() {
        return new ArrayList<>(deleted);
    }

    public int presignGetCalls() {
        return presignGetCalls.get();
    }

    public void failDeletes(boolean value) {
        this.failDeletes = value;
    }

    public void failPresignGet(boolean value) {
        this.failPresignGet = value;
    }

    public void reset() {
        objects.clear();
        uploads.clear();
        deleted.clear();
        presignGetCalls.set(0);
        failDeletes = false;
        failPresignGet = false;
    }

    @Override
    public String presignUpload(String key, String contentType, long size, Duration expiration) {
        uploads.add(new Upload(key, contentType, size, expiration));
        return "https://fake-s3.test/upload/" + key + "?size=" + size;
    }

    @Override
    public String presignGet(String key, Duration expiration) {
        presignGetCalls.incrementAndGet();
        if (failPresignGet) {
            throw new IllegalStateException("presign failed");
        }
        return "https://fake-s3.test/get/" + key + "?n=" + presignGetCalls.get();
    }

    @Override
    public Optional<StoredObject> head(String key) {
        return Optional.ofNullable(objects.get(key)).map(o -> new StoredObject(o.size(), o.contentType()));
    }

    @Override
    public byte[] readHead(String key, int length) {
        Stored stored = objects.get(key);
        return Arrays.copyOf(stored.bytes(), Math.min(length, stored.bytes().length));
    }

    @Override
    public void delete(String key) {
        if (failDeletes) {
            throw new IllegalStateException("delete failed");
        }
        objects.remove(key);
        deleted.add(key);
    }
}
