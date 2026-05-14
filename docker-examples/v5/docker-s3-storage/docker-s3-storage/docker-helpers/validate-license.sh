#!/bin/sh

# Validate a license JWT using the verification server
# Usage: validate-license <license-jwt>

if [ "$#" -ne 1 ]; then
    echo "Usage: validate-license <license-jwt>"
    echo ""
    echo "Example:"
    echo "  validate-license eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    exit 1
fi

LICENSE_JWT="$1"

echo "Validating license JWT with verification server..."
echo ""

# Call the verification server
RESPONSE=$(wget -q -O - \
  --header="Content-Type: application/json" \
  --header="Authorization: Bearer $LICENSE_JWT" \
  --post-data="{\"token\": \"$LICENSE_JWT\"}" \
  http://verification-server:3000/verify-license 2>&1)

echo "$RESPONSE"
echo ""

# Check if valid
if echo "$RESPONSE" | grep -q '"valid":true'; then
    echo "✅ License is VALID"
    exit 0
else
    echo "❌ License is INVALID"
    exit 1
fi
