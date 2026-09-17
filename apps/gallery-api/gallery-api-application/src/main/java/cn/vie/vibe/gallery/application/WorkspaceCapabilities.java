package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Capability;
import cn.vie.vibe.gallery.domain.MembershipRole;

import java.util.List;

public final class WorkspaceCapabilities {
    private WorkspaceCapabilities() {}

    public static List<Capability> forRole(MembershipRole role) {
        return switch (role) {
            case OWNER -> List.of(Capability.GALLERY_READ, Capability.GALLERY_CREATE, Capability.PHOTO_READ,
                    Capability.PHOTO_WRITE, Capability.CONFIG_READ, Capability.CONFIG_WRITE, Capability.PUBLISH,
                    Capability.SHARE_MANAGE, Capability.MEMBER_MANAGE);
            case EDITOR -> List.of(Capability.GALLERY_READ, Capability.PHOTO_READ, Capability.PHOTO_WRITE,
                    Capability.CONFIG_READ, Capability.CONFIG_WRITE);
            case VIEWER -> List.of(Capability.GALLERY_READ, Capability.PHOTO_READ, Capability.CONFIG_READ);
        };
    }
}
