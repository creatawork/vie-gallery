package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.PhotoProcessingTask;

import java.util.List;

public record TaskPage(List<PhotoProcessingTask> items, int page, int pageSize, long total, TaskSummary summary) {
    public TaskPage {
        items = List.copyOf(items == null ? List.of() : items);
        summary = summary == null ? TaskSummary.empty() : summary;
    }
}
