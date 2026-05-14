#!/bin/bash

set -e  # Exit on error

echo "================================================================================"
echo "GameMaker Package Manager - Deployment Script"
echo "================================================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo ""
    echo "Please create .env file with:"
    echo "  JWT_SECRET=your-secret"
    echo "  LICENSE_SECRET=your-license-secret"
    echo "  AWS_ACCESS_KEY_ID=your-key"
    echo "  AWS_SECRET_ACCESS_KEY=your-secret"
    echo "  AWS_REGION=us-east-2"
    echo "  S3_BUCKET=your-bucket"
    echo ""
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose not found!"
    echo "Please install Docker Compose and try again."
    exit 1
fi

echo "Step 1: Stopping existing containers..."
echo "--------------------------------------------------------------------------------"
docker-compose down 2>/dev/null || true
echo "✅ Stopped"
echo ""

echo "Step 2: Building Docker images..."
echo "--------------------------------------------------------------------------------"
docker-compose build --no-cache
echo "✅ Built"
echo ""

echo "Step 3: Starting services..."
echo "--------------------------------------------------------------------------------"
docker-compose up -d
echo "✅ Started"
echo ""

echo "Step 4: Waiting for services to be ready..."
echo "--------------------------------------------------------------------------------"
sleep 5

# Wait for Verdaccio
for i in {1..30}; do
    if curl -s http://localhost:4873/-/ping > /dev/null 2>&1; then
        echo "✅ Verdaccio is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Verdaccio failed to start"
        docker logs verdaccio-jwt-test --tail 20
        exit 1
    fi
    sleep 1
done

# Wait for verification server
for i in {1..30}; do
    if curl -s http://localhost:3000/verify-license > /dev/null 2>&1; then
        echo "✅ Verification server is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Verification server failed to start"
        docker logs verdaccio-verify-server --tail 20
        exit 1
    fi
    sleep 1
done
echo ""

echo "Step 5: Checking container status..."
echo "--------------------------------------------------------------------------------"
docker-compose ps
echo ""

echo "================================================================================"
echo "✅ DEPLOYMENT SUCCESSFUL"
echo "================================================================================"
echo ""
echo "Services Running:"
echo "  • Verdaccio:          http://localhost:4873"
echo "  • Verification Server: http://localhost:3000"
echo ""
echo "Next Steps:"
echo ""
echo "1. Create admin user (for publishing packages):"
echo "   npm login --registry http://localhost:4873"
echo "   # Username: admin"
echo "   # Password: your-password"
echo ""
echo "2. Configure GameMaker backend to generate license JWTs"
echo "   See DEPLOY.md for details"
echo ""
echo "3. Publish packages:"
echo "   npm publish --registry http://localhost:4873"
echo ""
echo "4. Customers use license JWT to install packages"
echo "   See DEPLOY.md for customer setup"
echo ""
echo "Useful Commands:"
echo "  docker-compose logs -f                 # View logs"
echo "  docker-compose down                    # Stop services"
echo "  docker-compose restart                 # Restart services"
echo "  docker exec verdaccio-jwt-test validate-license <jwt>  # Test JWT"
echo ""
echo "Documentation:"
echo "  DEPLOY.md                             # Full deployment guide"
echo "  plugins/verdaccio-dual-jwt-auth/README.md  # Plugin documentation"
echo ""
