package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;
import java.time.LocalDateTime;
import java.util.*;

@Mapper
public interface StorageObjectMapper {
    String COLUMNS = "BIN_TO_UUID(id) id,BIN_TO_UUID(tenant_id) tenantId,bucket,object_key objectKey,thumbnail_key thumbnailKey,mime_type mimeType,byte_size byteSize,width,height,sha256,status,created_at createdAt";

    @Insert("INSERT INTO storage_object(id,tenant_id,bucket,object_key,thumbnail_key,mime_type,byte_size,width,height,sha256,status,created_at,updated_at) VALUES(UUID_TO_BIN(#{id}),UUID_TO_BIN(#{tenant}),#{bucket},#{key},#{thumb},#{mime},#{size},#{width},#{height},#{sha},#{status},#{at},#{at})")
    int insert(@Param("id") String id, @Param("tenant") String t, @Param("bucket") String b, @Param("key") String k, @Param("thumb") String th, @Param("mime") String m, @Param("size") long s, @Param("width") Integer w, @Param("height") Integer h, @Param("sha") String sh, @Param("status") String st, @Param("at") LocalDateTime at);

    @Select("SELECT " + COLUMNS + " FROM storage_object WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    Map<String, Object> byId(@Param("tenant") String t, @Param("id") String id);

    @Update("UPDATE storage_object SET thumbnail_key=#{key},width=#{width},height=#{height},status='READY',updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id})")
    int ready(@Param("tenant") String t, @Param("id") String id, @Param("key") String k, @Param("width") Integer w, @Param("height") Integer h);

    @Update("UPDATE storage_object SET status='FAILED',updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id})")
    int failed(@Param("tenant") String t, @Param("id") String id);

    @Update("UPDATE storage_object SET status='DELETED',deleted_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id})")
    int delete(@Param("tenant") String t, @Param("id") String id);

    @Select("SELECT " + COLUMNS + " FROM storage_object WHERE status='UPLOADING' AND created_at < #{threshold} AND deleted_at IS NULL LIMIT #{limit}")
    List<Map<String, Object>> findStaleUploading(@Param("threshold") LocalDateTime threshold, @Param("limit") int limit);

    @Select("SELECT BIN_TO_UUID(s.id) id,BIN_TO_UUID(s.tenant_id) tenantId,s.bucket,s.object_key objectKey,s.thumbnail_key thumbnailKey,s.mime_type mimeType,s.byte_size byteSize,s.width,s.height,s.sha256,s.status,s.created_at createdAt " +
            "FROM storage_object s LEFT JOIN photo p ON s.id = p.storage_object_id AND p.deleted_at IS NULL " +
            "WHERE p.id IS NULL AND s.deleted_at IS NULL AND s.created_at < #{threshold} LIMIT #{limit}")
    List<Map<String, Object>> findOrphanObjects(@Param("threshold") LocalDateTime threshold, @Param("limit") int limit);
}
