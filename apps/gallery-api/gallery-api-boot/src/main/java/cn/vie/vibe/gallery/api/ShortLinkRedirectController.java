package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.ShareLinkFacade;
import cn.vie.vibe.gallery.application.ShortLinkTarget;
import cn.vie.vibe.gallery.domain.DomainException;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

/**
 * 短链接公开重定向控制器
 * 
 * 处理 /s/{shortCode} 路径的 HTTP 302 重定向
 */
@RestController
public class ShortLinkRedirectController {
    private final ShareLinkFacade shareLinkFacade;

    public ShortLinkRedirectController(ShareLinkFacade shareLinkFacade) {
        this.shareLinkFacade = shareLinkFacade;
    }

    /**
     * 短码重定向端点
     * 
     * GET /s/{shortCode} -> 302 到 /g/{slug}?t={token}
     * 
     * 这是公开端点，不需要认证
     */
    @GetMapping("/s/{shortCode}")
    public void redirect(
            @PathVariable("shortCode") String shortCode,
            HttpServletResponse response
    ) throws IOException {
        try {
            ShortLinkTarget target = shareLinkFacade.resolveShortLink(shortCode);
            response.sendRedirect(target.fullUrl());
        } catch (DomainException e) {
            // 短码不存在、已过期或已撤销，返回 404
            response.sendError(HttpStatus.NOT_FOUND.value(), "Short link not found or expired");
        }
    }
}
