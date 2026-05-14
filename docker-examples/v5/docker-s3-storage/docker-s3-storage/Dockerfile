FROM verdaccio/verdaccio:5

USER root

# Install utilities for healthchecks
RUN apk add --no-cache curl wget

# Install S3 storage plugin
RUN npm install -g verdaccio-aws-s3-storage

# Create necessary directories with proper permissions
RUN mkdir -p /verdaccio/conf /verdaccio/storage /verdaccio/plugins \
    && chown -R 10001:65533 /verdaccio \
    && chmod -R 755 /verdaccio

# Copy and install Dual JWT Auth plugin
COPY plugins/verdaccio-dual-jwt-auth /verdaccio/plugins/verdaccio-dual-jwt-auth
RUN cd /verdaccio/plugins/verdaccio-dual-jwt-auth && npm install \
    && chown -R 10001:65533 /verdaccio/plugins \
    && chmod -R 755 /verdaccio/plugins

# Copy helper scripts for debugging
COPY docker-helpers/validate-license.sh /usr/local/bin/validate-license
COPY docker-helpers/show-config.sh /usr/local/bin/show-config

# Make scripts executable
RUN chmod +x /usr/local/bin/validate-license \
    && chmod +x /usr/local/bin/show-config

EXPOSE 4873

USER 10001

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
ENV NODE_ENV=production
CMD ["verdaccio", "--config", "/verdaccio/conf/config.yaml", "--listen", "0.0.0.0:4873"]
