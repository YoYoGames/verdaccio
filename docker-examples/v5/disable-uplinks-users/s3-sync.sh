#!/bin/sh

/usr/bin/aws s3 sync /verdaccio s3://gmpm-verdaccio-registry/ --sse AES256 --delete
