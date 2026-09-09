package cn.vie.vibe.gallery.application;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Short-lived creator preview tokens. Lets an authenticated workspace member
 * open an unpublished gallery in the public viewer without making it public.
 */
@Component
public class CreatorPreviewTokens {
    public static final Duration TTL = Duration.ofMinutes(15);

    private final TokenGenerator tokenGenerator;
    private final ConcurrentHashMap<String, Issued> issued = new ConcurrentHashMap<>();

    public CreatorPreviewTokens(TokenGenerator tokenGenerator) {
        this.tokenGenerator = tokenGenerator;
    }

    public IssuedToken issue(UUID galleryId) {
        prune();
        String raw = tokenGenerator.generateToken();
        Instant expiresAt = Instant.now().plus(TTL);
        issued.put(tokenGenerator.hashToken(raw), new Issued(galleryId, expiresAt));
        return new IssuedToken(raw, expiresAt);
    }

    public Optional<UUID> resolve(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return Optional.empty();
        String hash = tokenGenerator.hashToken(rawToken);
        Issued entry = issued.get(hash);
        if (entry == null) return Optional.empty();
        if (!Instant.now().isBefore(entry.expiresAt())) {
            issued.remove(hash, entry);
            return Optional.empty();
        }
        return Optional.of(entry.galleryId());
    }

    private void prune() {
        Instant now = Instant.now();
        issued.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt()));
    }

    private record Issued(UUID galleryId, Instant expiresAt) {}

    public record IssuedToken(String token, Instant expiresAt) {}
}
