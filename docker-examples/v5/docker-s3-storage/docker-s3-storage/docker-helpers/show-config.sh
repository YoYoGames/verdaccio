#!/bin/sh

###############################################################################
# Show Current Configuration (Inside Container)
#
# This script displays the current Verdaccio configuration
#
# Usage: docker exec verdaccio show-config
###############################################################################

echo ""
echo "========================================================================"
echo "Verdaccio JWT Configuration"
echo "========================================================================"
echo ""

echo "Environment Variables:"
echo "  JWT_SECRET:          ${JWT_SECRET:+Set (${JWT_SECRET:0:20}...)}"
echo "  GM_ACCESS_KEY_1:     ${GM_ACCESS_KEY_1:+Set}"
echo "  GM_ACCESS_KEY_2:     ${GM_ACCESS_KEY_2:+Set}"
echo "  AWS_ACCESS_KEY_ID:   ${AWS_ACCESS_KEY_ID:+Set}"
echo "  AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:+Set}"
echo ""

echo "Plugin Status:"
if [ -d "/verdaccio/plugins/verdaccio-jwt-auth" ]; then
    echo "  JWT Plugin:          Installed"
    if [ -d "/verdaccio/plugins/verdaccio-jwt-auth/node_modules" ]; then
        echo "  Dependencies:        Installed"
    else
        echo "  Dependencies:        NOT INSTALLED"
    fi
else
    echo "  JWT Plugin:          NOT FOUND"
fi
echo ""

echo "Verdaccio Status:"
if wget -q -O- http://localhost:4873/-/ping 2>/dev/null | grep -q "{}"; then
    echo "  Server:              Running"
else
    echo "  Server:              Not responding"
fi
echo ""

echo "Available Commands:"
echo "  generate-token <user>              - Generate JWT token"
echo "  generate-secret                    - Generate JWT_SECRET"
echo "  test-auth                          - Test authentication"
echo "  show-config                        - Show this config"
echo ""
echo "========================================================================"
echo ""
