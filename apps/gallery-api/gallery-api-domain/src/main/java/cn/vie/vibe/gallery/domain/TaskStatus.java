package cn.vie.vibe.gallery.domain;

public enum TaskStatus {
    /** Legacy value kept for source compatibility; persisted tasks are normalized to QUEUED. */
    PENDING,
    QUEUED,
    PROCESSING,
    SUCCEEDED,
    FAILED,
    CANCEL_REQUESTED,
    CANCELLED;

    public boolean isTerminal() {
        return this == SUCCEEDED || this == FAILED || this == CANCELLED;
    }

    public TaskStatus normalized() {
        return this == PENDING ? QUEUED : this;
    }
}
