package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.BrandSiteFacade;
import cn.vie.vibe.gallery.domain.DomainException;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 品牌站公开端点（访客，无鉴权）：
 *  - GET  /{subdomain}          已发布站点 + 解析后的展示资产（EXPIRED 时只回状态，渲染端出暂停页）
 *  - POST /{subdomain}/inquiries 站内表单询盘（§4.2 contact 必备区块）
 *  - POST /{subdomain}/events    转化埋点接收端（WP-13 通道的预留接缝，当前只做 204 应答）
 */
@RestController
@RequestMapping("/api/public/sites")
public class BrandSitePublicController {
    private final BrandSiteFacade facade;
    private final BrandSiteViewAssembler assembler;

    public BrandSitePublicController(BrandSiteFacade facade, BrandSiteViewAssembler assembler) {
        this.facade = facade;
        this.assembler = assembler;
    }

    @GetMapping("/{subdomain}")
    public ResponseEntity<JsonNode> getSite(@PathVariable("subdomain") String subdomain) {
        return facade.getPublicBySubdomain(subdomain)
                .map(assembler::assemblePublicSite)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
    }

    @PostMapping("/{subdomain}/inquiries")
    public ResponseEntity<Void> submitInquiry(
            @PathVariable("subdomain") String subdomain,
            @Valid @RequestBody InquiryRequest request
    ) {
        try {
            facade.submitInquiry(subdomain, request.name().trim(), request.message().trim());
        } catch (DomainException e) {
            // 站点不存在/停用：按 404 处理，渲染端据此回退到微信引导
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{subdomain}/events")
    public ResponseEntity<Void> trackEvent(
            @PathVariable("subdomain") String subdomain,
            @RequestBody(required = false) JsonNode payload
    ) {
        // WP-13 track-event 通道：事件先落 204 应答，管道接入后在此转发/聚合
        return ResponseEntity.noContent().build();
    }

    public record InquiryRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Size(max = 4000) String message
    ) {}
}
