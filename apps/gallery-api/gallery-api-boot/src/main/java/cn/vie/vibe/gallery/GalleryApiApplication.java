package cn.vie.vibe.gallery;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication(scanBasePackages = "cn.vie.vibe.gallery")
@MapperScan("cn.vie.vibe.gallery.infrastructure.persistence.mapper")
public class GalleryApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(GalleryApiApplication.class, args);
    }
}
