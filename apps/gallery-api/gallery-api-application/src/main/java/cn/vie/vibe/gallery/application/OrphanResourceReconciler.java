package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.StorageObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
public class OrphanResourceReconciler {
    private static final Logger log = LoggerFactory.getLogger(OrphanResourceReconciler.class);

    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final TenantQuotaRepository quotas;
    private final Duration staleThreshold;

    public OrphanResourceReconciler(StorageObjectRepository objects,
                                    ObjectStoragePort storage,
                                    TenantQuotaRepository quotas) {
        this(objects, storage, quotas, Duration.ofMinutes(30));
    }

    @Autowired
    public OrphanResourceReconciler(StorageObjectRepository objects,
                                    ObjectStoragePort storage,
                                    TenantQuotaRepository quotas,
                                    @Value("${gallery.processing.orphan-threshold:PT30M}") Duration staleThreshold) {
        this.objects = objects;
        this.storage = storage;
        this.quotas = quotas;
        this.staleThreshold = staleThreshold == null || staleThreshold.isNegative() || staleThreshold.isZero()
                ? Duration.ofMinutes(30) : staleThreshold;
    }

    @Scheduled(fixedDelayString = "${gallery.processing.orphan-scan-interval:600000}")
    public ReconciliationReport scanAndClean() {
        Instant threshold = Instant.now().minus(staleThreshold);
        int cleanedUploading = cleanStaleUploading(threshold);
        int cleanedOrphans = cleanOrphanObjects(threshold);
        if (cleanedUploading > 0 || cleanedOrphans > 0) {
            log.info("gallery_orphan_reconciliation_completed cleanedStaleUploading={} cleanedOrphanObjects={}",
                    cleanedUploading, cleanedOrphans);
        }
        return new ReconciliationReport(cleanedUploading, cleanedOrphans);
    }

    public int cleanStaleUploading(Instant threshold) {
        List<StorageObject> stale = objects.findStaleUploading(threshold, 50);
        int count = 0;
        for (StorageObject obj : stale) {
            try {
                if (obj.objectKey() != null) {
                    try {
                        storage.delete(obj.objectKey());
                    } catch (RuntimeException e) {
                        log.warn("gallery_orphan_storage_delete_failed key={}", obj.objectKey(), e);
                    }
                }
                objects.softDelete(obj.tenantId(), obj.id());
                if (quotas != null) {
                    quotas.releaseOnce(obj.tenantId(), "STORAGE_OBJECT_STALE", obj.id(), obj.byteSize(), 1);
                }
                count++;
            } catch (RuntimeException e) {
                log.error("gallery_orphan_clean_error objectId={}", obj.id(), e);
            }
        }
        return count;
    }

    public int cleanOrphanObjects(Instant threshold) {
        List<StorageObject> orphans = objects.findOrphanObjects(threshold, 50);
        int count = 0;
        for (StorageObject obj : orphans) {
            try {
                if (obj.objectKey() != null) {
                    try {
                        storage.delete(obj.objectKey());
                    } catch (RuntimeException e) {
                        log.warn("gallery_orphan_storage_delete_failed key={}", obj.objectKey(), e);
                    }
                }
                if (obj.thumbnailKey() != null) {
                    try {
                        storage.delete(obj.thumbnailKey());
                    } catch (RuntimeException ignored) {
                    }
                }
                objects.softDelete(obj.tenantId(), obj.id());
                if (quotas != null) {
                    quotas.releaseOnce(obj.tenantId(), "STORAGE_OBJECT_ORPHAN", obj.id(), obj.byteSize(), 1);
                }
                count++;
            } catch (RuntimeException e) {
                log.error("gallery_orphan_clean_error objectId={}", obj.id(), e);
            }
        }
        return count;
    }

    public record ReconciliationReport(int cleanedStaleUploading, int cleanedOrphanObjects) {}
}
