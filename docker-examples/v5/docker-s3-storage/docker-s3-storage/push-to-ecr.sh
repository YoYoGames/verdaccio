#!/bin/bash

set -e

echo "================================================================================"
echo "Push Docker Images to AWS ECR"
echo "================================================================================"
echo ""


AWS_ACCOUNT_ID="436685692178"
AWS_REGION=${2:-us-west-2}
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "Configuration:"
echo "  AWS Account:  $AWS_ACCOUNT_ID"
echo "  AWS Region:   $AWS_REGION"
echo "  ECR Registry: $ECR_REGISTRY"
echo ""

# Step 1: Login to ECR
echo "Step 1: Logging in to ECR..."
echo "--------------------------------------------------------------------------------"
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY
echo "✅ Logged in"
echo ""

# Step 3: Build Verdaccio image
echo "Step 3: Building Verdaccio image..."
echo "--------------------------------------------------------------------------------"
docker build -t sdks-gmrt-registry:latest .
docker tag sdks-gmrt-registry:latest ${ECR_REGISTRY}/sdks-gmrt-registry:latest
echo "✅ Built sdks-gmrt-registry"
echo ""

# Step 4: Build verify-server image
echo "Step 4: Building verify-server image..."
echo "--------------------------------------------------------------------------------"
docker build -t verify-server:latest \
  -f plugins/verdaccio-dual-jwt-auth/Dockerfile.verify \
  plugins/verdaccio-dual-jwt-auth/
docker tag verify-server:latest ${ECR_REGISTRY}/verify-server:latest
echo "✅ Built verify-server"
echo ""

# Step 5: Push Verdaccio image
echo "Step 5: Pushing Verdaccio image to ECR..."
echo "--------------------------------------------------------------------------------"
docker push ${ECR_REGISTRY}/sdks-gmrt-registry:latest
echo "✅ Pushed sdks-gmrt-registry"
echo ""

# Step 6: Push verify-server image
echo "Step 6: Pushing verify-server image to ECR..."
echo "--------------------------------------------------------------------------------"
docker push ${ECR_REGISTRY}/verify-server:latest
echo "✅ Pushed verify-server"
echo ""

echo "================================================================================"
echo "✅ PUSH SUCCESSFUL"
echo "================================================================================"
echo ""
echo "Images pushed:"
echo "  • ${ECR_REGISTRY}:latest"
echo "  • ${ECR_REGISTRY}/verify-server:latest"
echo ""
echo "Next Steps:"
echo ""
echo "1. Update terraform/terraform.tfvars with these image URIs:"
echo "   verdaccio_image     = \"${ECR_REGISTRY}/verdaccio-gmpm:latest\""
echo "   verify_server_image = \"${ECR_REGISTRY}/verify-server:latest\""
echo ""
echo "2. Deploy with Terraform:"
echo "   cd terraform"
echo "   terraform apply"
echo ""
