package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.TaskStatus;

import java.util.EnumMap;
import java.util.Map;

public record TaskSummary(long queued, long processing, long succeeded, long failed, long cancelled) {
    public static TaskSummary empty() {
        return new TaskSummary(0, 0, 0, 0, 0);
    }

    public static TaskSummary from(Iterable<PhotoProcessingTask> tasks) {
        Map<TaskStatus, Long> counts = new EnumMap<>(TaskStatus.class);
        for (PhotoProcessingTask task : tasks) {
            TaskStatus status = task.status().normalized();
            counts.merge(status, 1L, Long::sum);
        }
        return of(counts);
    }

    public static TaskSummary of(Map<TaskStatus, Long> counts) {
        return new TaskSummary(
                counts.getOrDefault(TaskStatus.QUEUED, 0L),
                counts.getOrDefault(TaskStatus.PROCESSING, 0L),
                counts.getOrDefault(TaskStatus.SUCCEEDED, 0L),
                counts.getOrDefault(TaskStatus.FAILED, 0L),
                counts.getOrDefault(TaskStatus.CANCELLED, 0L));
    }
}
