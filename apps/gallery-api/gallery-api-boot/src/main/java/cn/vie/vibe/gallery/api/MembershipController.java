package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.MembershipFacade;
import cn.vie.vibe.gallery.domain.MembershipRole;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/workspace/members")
public class MembershipController {
    private final MembershipFacade facade;

    public MembershipController(MembershipFacade facade) { this.facade = facade; }

    @GetMapping
    public List<MemberResponse> list() { return facade.list().stream().map(MemberResponse::from).toList(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MemberResponse add(@Valid @RequestBody AddMemberRequest request) {
        return MemberResponse.from(facade.add(request.email(), request.role()));
    }

    @PatchMapping("/{membershipId}")
    public MemberResponse update(@PathVariable UUID membershipId, @Valid @RequestBody UpdateMemberRequest request) {
        return MemberResponse.from(facade.updateRole(membershipId, request.role()));
    }

    @DeleteMapping("/{membershipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable UUID membershipId) { facade.remove(membershipId); }

    public record AddMemberRequest(@NotBlank @Email String email, @jakarta.validation.constraints.NotNull MembershipRole role) {}
    public record UpdateMemberRequest(@jakarta.validation.constraints.NotNull MembershipRole role) {}
    public record MemberResponse(String id, String userId, String email, String displayName,
                                 MembershipRole role, Instant joinedAt) {
        static MemberResponse from(MembershipFacade.MemberView member) {
            return new MemberResponse(member.id().toString(), member.userId().toString(), member.email(),
                    member.displayName(), member.role(), member.joinedAt());
        }
    }
}
