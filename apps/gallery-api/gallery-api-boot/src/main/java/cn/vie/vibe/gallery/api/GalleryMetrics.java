package cn.vie.vibe.gallery.api;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * 业务指标收集器（Micrometer）
 */
@Component
public class GalleryMetrics {
    private final Counter uploadAcceptedCounter;
    private final Counter uploadRejectedCounter;
    private final Counter taskFailedCounter;
    private final Counter storagePutErrorCounter;
    private final MeterRegistry registry;

    public GalleryMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.uploadAcceptedCounter = Counter.builder("gallery.upload.accepted")
                .description("已接收并排队处理的照片上传数")
                .register(registry);
        this.uploadRejectedCounter = Counter.builder("gallery.upload.rejected")
                .description("被拒绝或校验失败的照片上传数")
                .register(registry);
        this.taskFailedCounter = Counter.builder("gallery.task.failed")
                .description("处理失败的照片任务数")
                .register(registry);
        this.storagePutErrorCounter = Counter.builder("gallery.storage.put.error")
                .description("对象存储写入失败次数")
                .register(registry);
    }

    public void recordUploadAccepted(int count) {
        if (count > 0) uploadAcceptedCounter.increment(count);
    }

    public void recordUploadRejected(int count) {
        if (count > 0) uploadRejectedCounter.increment(count);
    }

    public void recordTaskFailed() {
        taskFailedCounter.increment();
    }

    public void recordStoragePutError() {
        storagePutErrorCounter.increment();
    }

    public void recordPublicAccess(String slug) {
        Counter.builder("gallery.public.access")
                .tag("slug", slug != null && !slug.isBlank() ? slug : "unknown")
                .description("公开相册访问总请求数")
                .register(registry)
                .increment();
    }
}
