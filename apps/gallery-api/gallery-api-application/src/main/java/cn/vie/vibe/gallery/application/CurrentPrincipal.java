package cn.vie.vibe.gallery.application;

import java.io.Serializable;
import java.util.UUID;

public record CurrentPrincipal(UUID userId, long authenticationVersion) implements Serializable {
    public CurrentPrincipal(UUID userId) {
        this(userId, 1L);
    }
}
