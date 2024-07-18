FROM verdaccio/verdaccio:5

ENV AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
    
USER root    

# Update and install necessary dependencies including python3, py3-pip, jq, and curl
RUN apk update && apk upgrade
RUN apk add --no-cache python3 py3-pip jq curl

# Create a virtual environment for installing awscli
RUN python3 -m venv /opt/venv
RUN /opt/venv/bin/pip install --no-cache --upgrade awscli

# Verify AWS CLI installation
RUN /opt/venv/bin/aws --version

# Install verdaccio-aws-s3-storage plugin
RUN npm install -g verdaccio-aws-s3-storage    

# Create necessary directories with proper permissions
RUN mkdir -p /verdaccio/conf /verdaccio/storage \
    && chown -R 10001:65533 /verdaccio \
    && chmod -R 755 /verdaccio

COPY run-verdaccio.sh /usr/local/bin/run-verdaccio.sh
COPY s3-sync.sh /usr/local/bin/s3-sync.sh
COPY config.yaml.template /verdaccio/conf/config.yaml

RUN chmod +x /usr/local/bin/run-verdaccio.sh && chmod +x /usr/local/bin/s3-sync.sh

EXPOSE $VERDACCIO_PORT

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
ENV NODE_ENV=production
CMD ["/usr/local/bin/run-verdaccio.sh"]
