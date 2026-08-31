package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Tenant;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.User;

public record AuthenticatedUser(User user, Tenant tenant, MembershipRole role) {
}
