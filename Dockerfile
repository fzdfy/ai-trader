FROM postgres:18
RUN apt-get update && apt-get install -y postgresql-18-pgvector

 
# 首次初始化数据库时自动启用 vector 扩展（等价于 psql 中执行 CREATE EXTENSION）
COPY docker/init-vector.sql /docker-entrypoint-initdb.d/01-init-vector.sql