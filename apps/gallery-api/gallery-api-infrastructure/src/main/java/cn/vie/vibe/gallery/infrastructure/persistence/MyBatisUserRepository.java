package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.UserRepository;
import cn.vie.vibe.gallery.domain.User;
import cn.vie.vibe.gallery.domain.UserStatus;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.UserMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.instant;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
public class MyBatisUserRepository implements UserRepository {
    private final UserMapper mapper;

    public MyBatisUserRepository(UserMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<User> findByEmail(String email) {
        return Optional.ofNullable(mapper.findByEmail(email)).map(MyBatisUserRepository::toDomain);
    }

    @Override
    public Optional<User> findById(UUID id) {
        return Optional.ofNullable(mapper.findById(id.toString())).map(MyBatisUserRepository::toDomain);
    }

    @Override
    public User save(User user) {
        Instant now = Instant.now();
        mapper.insert(user.id().toString(), user.email(), user.displayName(), user.passwordHash(),
                user.status().name(), localDateTime(user.lastLoginAt()), localDateTime(now), localDateTime(now));
        return user;
    }

    @Override
    public void updateLastLoginAt(UUID id, Instant lastLoginAt) {
        mapper.updateLastLoginAt(id.toString(), localDateTime(lastLoginAt));
    }

    private static User toDomain(java.util.Map<String, Object> row) {
        return new User(uuid(row, "id"), (String) row.get("email"), (String) row.get("displayName"),
                (String) row.get("passwordHash"), UserStatus.valueOf((String) row.get("status")), instant(row, "lastLoginAt"));
    }
}
