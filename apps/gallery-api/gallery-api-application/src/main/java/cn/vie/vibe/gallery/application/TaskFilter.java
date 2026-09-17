package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.TaskStatus;

import java.util.EnumSet;
import java.util.Set;

public record TaskFilter(Set<TaskStatus> statuses) {
    public TaskFilter {
        statuses = statuses == null || statuses.isEmpty()
                ? EnumSet.allOf(TaskStatus.class)
                : EnumSet.copyOf(statuses);
        if (statuses.contains(TaskStatus.PENDING)) statuses.add(TaskStatus.QUEUED);
    }

    public static TaskFilter all() {
        return new TaskFilter(EnumSet.allOf(TaskStatus.class));
    }

    public boolean includes(TaskStatus status) {
        return statuses.contains(status) || (status == TaskStatus.QUEUED && statuses.contains(TaskStatus.PENDING));
    }
}
