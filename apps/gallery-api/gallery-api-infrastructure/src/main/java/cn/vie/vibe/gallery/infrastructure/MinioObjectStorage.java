package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ObjectStoragePort;
import cn.vie.vibe.gallery.application.StoredObject;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.http.Method;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

@Component
@Profile("!dev-memory & !local-storage")
public class MinioObjectStorage implements ObjectStoragePort {
    private final MinioClient client;
    private final MinioClient signingClient;
    private final String bucket;

    public MinioObjectStorage(
            @Value("${gallery.storage.endpoint:http://localhost:9000}") String endpoint,
            @Value("${gallery.storage.public-endpoint:}") String publicEndpoint,
            @Value("${gallery.storage.access-key:vie_local}") String accessKey,
            @Value("${gallery.storage.secret-key:vie_local_secret}") String secretKey,
            @Value("${gallery.storage.bucket:vie-gallery}") String bucket
    ) {
        this.client = MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .region("us-east-1")
                .build();
        String signingEndpoint = publicEndpoint == null || publicEndpoint.isBlank()
                ? endpoint
                : publicEndpoint;
        this.signingClient = signingEndpoint.equals(endpoint)
                ? client
                : MinioClient.builder()
                        .endpoint(signingEndpoint)
                        .credentials(accessKey, secretKey)
                        .region("us-east-1")
                        .build();
        this.bucket = bucket;
        ensureBucket();
    }

    private void ensureBucket() {
        try {
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Object storage unavailable", exception);
        }
    }

    @Override
    public StoredObject put(String key, InputStream content, String contentType, long size) {
        try {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(content, size, -1)
                    .contentType(contentType)
                    .build());
            return new StoredObject(bucket, key, null, size, null, null, "");
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public InputStream get(String key) {
        try {
            return client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build());
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public void delete(String key) {
        try {
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build());
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public void ping() {
        try {
            if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                throw new IllegalStateException("Object storage bucket missing: " + bucket);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Object storage unavailable", exception);
        }
    }

    @Override
    public URI createReadUrl(String key, Duration ttl) {
        Objects.requireNonNull(key, "key");
        Objects.requireNonNull(ttl, "ttl");
        long seconds = ttl.getSeconds();
        if (seconds < 1 || seconds > 7 * 24 * 60 * 60 || ttl.getNano() != 0) {
            throw new IllegalArgumentException("MinIO read URL TTL must be between 1 second and 7 days");
        }
        try {
            return URI.create(signingClient.getPresignedObjectUrl(
                    GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucket)
                            .object(key)
                            .expiry((int) seconds, TimeUnit.SECONDS)
                            .build()));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not create signed object URL", exception);
        }
    }
}
