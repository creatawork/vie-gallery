package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ObjectStoragePort;
import cn.vie.vibe.gallery.application.StoredObject;
import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.model.PutObjectRequest;
import com.aliyun.oss.model.GeneratePresignedUrlRequest;
import com.aliyun.oss.model.OSSObject;
import com.aliyun.oss.model.ObjectMetadata;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.time.Duration;
import java.util.Date;
import java.util.Objects;

@Component
@Profile("aliyun-oss")
public class AliyunOssObjectStorage implements ObjectStoragePort {
    private final OSS ossClient;
    private final String bucket;
    private final String endpoint;

    public AliyunOssObjectStorage(
            @Value("${gallery.storage.aliyun.endpoint}") String endpoint,
            @Value("${gallery.storage.aliyun.access-key-id}") String accessKeyId,
            @Value("${gallery.storage.aliyun.access-key-secret}") String accessKeySecret,
            @Value("${gallery.storage.aliyun.bucket}") String bucket
    ) {
        this.endpoint = endpoint;
        this.bucket = bucket;
        this.ossClient = new OSSClientBuilder().build(endpoint, accessKeyId, accessKeySecret);
        ensureBucket();
    }

    private void ensureBucket() {
        try {
            if (!ossClient.doesBucketExist(bucket)) {
                throw new IllegalStateException("OSS bucket does not exist: " + bucket);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Object storage unavailable", exception);
        }
    }

    @Override
    public StoredObject put(String key, InputStream content, String contentType, long size) {
        try {
            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentType(contentType);
            metadata.setContentLength(size);
            
            // 设置 inline disposition，让浏览器预览而不是下载
            // 这样就不需要在预签名 URL 中覆盖响应头
            metadata.setContentDisposition("inline");
            
            PutObjectRequest putObjectRequest = new PutObjectRequest(bucket, key, content, metadata);
            ossClient.putObject(putObjectRequest);
            
            return new StoredObject(bucket, key, null, size, null, null, "");
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to upload object to OSS", exception);
        }
    }

    @Override
    public InputStream get(String key) {
        try {
            OSSObject ossObject = ossClient.getObject(bucket, key);
            return ossObject.getObjectContent();
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to get object from OSS", exception);
        }
    }

    @Override
    public void delete(String key) {
        try {
            ossClient.deleteObject(bucket, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to delete object from OSS", exception);
        }
    }

    @Override
    public void ping() {
        try {
            if (!ossClient.doesBucketExist(bucket)) {
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
        if (seconds < 1 || seconds > 7 * 24 * 60 * 60) {
            throw new IllegalArgumentException("OSS read URL TTL must be between 1 second and 7 days");
        }
        
        try {
            Date expiration = new Date(System.currentTimeMillis() + ttl.toMillis());
            GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(bucket, key);
            request.setExpiration(expiration);
            request.setMethod(com.aliyun.oss.HttpMethod.GET);
            
            // 不使用 ResponseHeaderOverrides，因为：
            // 1. 会导致签名验证失败（403）
            // 2. 改为在上传时设置 Content-Disposition: inline
            
            URL url = ossClient.generatePresignedUrl(request);
            return url.toURI();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not create signed object URL", exception);
        }
    }
}
