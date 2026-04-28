#!/bin/sh
set -e

source /opt/venv/bin/activate

export AWS_DEFAULT_REGION="us-west-2"
export S3_BUCKET=gmpm-verdaccio-registry
export AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY

aws configure set default.region us-west-2

# Activate the virtual environment
. /opt/venv/bin/activate

if [ -n $S3_BUCKET ]; then
  echo "Setting up S3-Sync"
  touch /var/log/s3-sync.log

  aws s3 sync s3://gmpm-verdaccio-registry /verdaccio
  echo "Changing file permissions to verdaccio user"
  chown -R verdaccio /verdaccio

  echo "*/5 * * * * /usr/local/bin/s3-sync.sh > /var/log/s3-sync.log" | /usr/bin/crontab -
  echo "Ensure Cron is running in background"
  /usr/sbin/crond
fi

echo "Starting Verdaccio Server"
su -s "/bin/sh" -c "/usr/local/lib/node_modules/verdaccio/bin/verdaccio --config /verdaccio/conf/config.yaml --listen $VERDACCIO_PROTOCOL://0.0.0.0:${VERDACCIO_PORT}" "verdaccio"
