# Verdaccio with Dual JWT Authentication

Verdaccio npm registry with GameMaker license-based authentication.

## Local Setup

```bash
# Start services
docker-compose up -d

# Verify running
curl http://localhost:4873/-/ping
curl http://localhost:3000/verify-license
```

## Test

```bash
# Generate test license JWT
LICENSE_JWT=$(docker exec verdaccio-verify-server node -e "
const jwt = require('jsonwebtoken');
console.log(jwt.sign({
  email: 'test@gamemaker.io',
  consoles: ['switch', 'ps4']
}, process.env.LICENSE_SECRET, { expiresIn: '1d' }));
")

# Test package access
curl http://localhost:4873/@gmpm/switch-sdk \
  -H "Client-Authorization: Bearer $LICENSE_JWT"
```

## AWS Deployment

```bash
# 1. Push images to ECR
cd /d/verdaccio/docker-examples/v5/docker-s3-storage
./push-to-ecr.sh YOUR_ACCOUNT_ID us-west-2

# 2. Deploy with Terraform (see terraform/README.md)
cd terraform
# Edit terraform.tfvars with your values (secrets from .env already there)
terraform init
terraform apply

# 3. Test
curl http://YOUR-ALB-URL/-/ping
```

## Authentication

- **Admins**: Username/password → publish packages
- **Customers**: License JWT only → install packages (no username/password)

## Files

- `config.yaml` - Verdaccio configuration
- `plugins/verdaccio-dual-jwt-auth/` - Custom auth plugin
- `verify-server/` - License verification service
- `docker-compose.yml` - Local development
- `deploy.sh` - AWS deployment script
