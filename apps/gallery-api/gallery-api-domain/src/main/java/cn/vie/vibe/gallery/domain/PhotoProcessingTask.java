package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record PhotoProcessingTask(UUID id, UUID tenantId, UUID photoId, TaskStatus status,
                                  int attempts, String errorMessage, Instant lockedAt, Instant completedAt) {}
