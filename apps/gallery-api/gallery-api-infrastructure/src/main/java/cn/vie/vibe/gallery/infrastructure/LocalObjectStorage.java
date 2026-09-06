package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ObjectStoragePort;
import cn.vie.vibe.gallery.application.StoredObject;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;

@Component
@Profile("local-storage")
public class LocalObjectStorage implements ObjectStoragePort {
    private final Path root = Paths.get(System.getProperty("vie.storage.root", "data/objects"));

    @Override
    public StoredObject put(String key, InputStream in, String type, long size) {
        try {
            Path path = root.resolve(key);
            Files.createDirectories(path.getParent());
            Files.copy(in, path, StandardCopyOption.REPLACE_EXISTING);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = Files.readAllBytes(path);
            for (byte value : bytes) {
                digest.update(value);
            }
            StringBuilder sha256 = new StringBuilder();
            for (byte value : digest.digest()) {
                sha256.append(String.format("%02x", value));
            }
            return new StoredObject("local", key, null, size, null, null, sha256.toString());
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public InputStream get(String key) {
        try {
            return Files.newInputStream(root.resolve(key));
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(root.resolve(key));
        } catch (IOException exception) {
            throw new IllegalStateException(exception);
        }
    }

    /**
     * Local storage is a test/dev adapter; it intentionally keeps a file URI
     * rather than pretending to provide a production signed URL.
     */
    @Override
    public URI createReadUrl(String key, Duration ttl) {
        return root.resolve(key).toUri();
    }

    @Override
    public URI createReadUrl(String key) {
        return root.resolve(key).toUri();
    }
}
